<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$legacySessionCookie = isset($_COOKIE['nexashop_session']);
session_name($legacySessionCookie ? 'nexashop_session' : 'qubix_session');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();

function respond(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readInput(): array
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        respond(400, ['error' => 'بيانات الطلب غير صالحة.']);
    }

    return $input;
}

function textValue(array $input, string $key): string
{
    $value = $input[$key] ?? '';
    return is_string($value) ? trim($value) : '';
}

function stringLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    $length = preg_match_all('/./us', $value, $matches);
    return $length === false ? strlen($value) : $length;
}

function profileFromSession(PDO $pdo): ?array
{
    $user = $_SESSION['user'] ?? null;
    if (!is_array($user)) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT id, username, full_name, email, bio, city, job_title AS work, role
         FROM users WHERE id = :id AND is_active = 1 LIMIT 1'
    );
    $statement->execute(['id' => $user['id'] ?? 0]);
    $row = $statement->fetch();
    if (!$row) {
        unset($_SESSION['user']);
        return null;
    }

    $type = $row['role'] === 'customer' ? 'customer' : 'employee';
    $role = $row['role'];
    $freshUser = [
        'id' => (int) $row['id'],
        'type' => $type,
        'username' => $row['username'],
        'name' => $row['full_name'],
        'email' => $row['email'],
        'bio' => $row['bio'] ?? '',
        'city' => $row['city'] ?? '',
        'work' => $row['work'] ?? '',
        'role' => $role,
        'isAdmin' => in_array($role, ['manager', 'admin'], true),
    ];
    $_SESSION['user'] = $freshUser;
    return $freshUser;
}

function saveProfile(array $user): void
{
    $_SESSION['user'] = $user;
}

function requireUser(PDO $pdo): array
{
    $user = profileFromSession($pdo);
    if (!$user) {
        respond(401, ['error' => 'سجّل الدخول أولًا.']);
    }

    return $user;
}

function requireAdmin(PDO $pdo): array
{
    $user = requireUser($pdo);
    if (!in_array($user['role'], ['manager', 'admin'], true)) {
        respond(403, ['error' => 'ليس لديك صلاحية الوصول إلى لوحة الإدارة.']);
    }

    return $user;
}

set_exception_handler(static function (Throwable $error): never {
    error_log('QUBIX API request failed: ' . $error->getMessage());
    if ($error instanceof PDOException
        && in_array((string) $error->getCode(), ['42S02', '42S22'], true)) {
        respond(503, ['error' => 'قاعدة البيانات تحتاج إلى تحديث. استورد backend/migrate_real_store.sql من phpMyAdmin ثم حدّث الصفحة.']);
    }
    respond(500, ['error' => 'حدث خطأ داخلي أثناء معالجة الطلب. تحقق من سجل أخطاء PHP.']);
});

try {
    $config = require __DIR__ . '/config.php';
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['host'],
        $config['database']
    );
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (Throwable $error) {
    error_log('QUBIX database connection failed: ' . $error->getMessage());
    respond(503, ['error' => 'تعذر الاتصال بقاعدة البيانات. تأكد من تشغيل MySQL وإعداد الاتصال.']);
}

$route = $_GET['route'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($route === 'products' && $method === 'GET') {
    $statement = $pdo->query(
        'SELECT p.id, p.name, p.price, p.category,
                p.image_path AS image, p.description,
                COALESCE(AVG(r.rating), 0) AS rating, COUNT(r.id) AS reviewCount
         FROM products p
         LEFT JOIN product_reviews r ON r.product_id = p.id
         WHERE p.is_active = 1
         GROUP BY p.id
         ORDER BY p.id DESC'
    );
    $stats = $pdo->query(
        "SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_active = 1) AS customers,
            (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
            (SELECT COUNT(*) FROM orders WHERE status = 'completed') AS completedOrders,
            (SELECT COUNT(*) FROM product_reviews) AS reviews"
    )->fetch();
    respond(200, [
        'products' => $statement->fetchAll(),
        'stats' => [
            'customers' => (int) $stats['customers'],
            'products' => (int) $stats['products'],
            'completedOrders' => (int) $stats['completedOrders'],
            'reviews' => (int) $stats['reviews'],
        ],
    ]);
}

if ($route === 'product/reviews' && $method === 'GET') {
    $productId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$productId) {
        respond(422, ['error' => 'رقم المنتج غير صالح.']);
    }

    $productQuery = $pdo->prepare('SELECT id FROM products WHERE id = :id AND is_active = 1 LIMIT 1');
    $productQuery->execute(['id' => $productId]);
    if (!$productQuery->fetch()) {
        respond(404, ['error' => 'المنتج غير موجود.']);
    }

    $reviewQuery = $pdo->prepare(
        'SELECT r.rating, r.review_text AS review, r.created_at AS createdAt
         FROM product_reviews r
         WHERE r.product_id = :product_id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 50'
    );
    $reviewQuery->execute(['product_id' => $productId]);

    $user = profileFromSession($pdo);
    $canReview = false;
    if ($user && $user['role'] === 'customer') {
        $eligibility = $pdo->prepare(
            "SELECT 1 FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = :user_id AND o.status = 'completed'
               AND oi.product_id = :product_id
             LIMIT 1"
        );
        $eligibility->execute(['user_id' => $user['id'], 'product_id' => $productId]);
        $hasCompletedPurchase = (bool) $eligibility->fetchColumn();
        $existing = $pdo->prepare(
            'SELECT 1 FROM product_reviews WHERE user_id = :user_id AND product_id = :product_id LIMIT 1'
        );
        $existing->execute(['user_id' => $user['id'], 'product_id' => $productId]);
        $canReview = $hasCompletedPurchase && !$existing->fetchColumn();
    }

    respond(200, ['reviews' => $reviewQuery->fetchAll(), 'canReview' => $canReview]);
}

if ($route === 'product/reviews' && $method === 'POST') {
    $user = requireUser($pdo);
    if ($user['role'] !== 'customer') {
        respond(403, ['error' => 'تقييم المنتجات متاح لحسابات العملاء فقط.']);
    }
    $input = readInput();
    $productId = filter_var($input['productId'] ?? null, FILTER_VALIDATE_INT);
    $rating = filter_var($input['rating'] ?? null, FILTER_VALIDATE_INT);
    $review = textValue($input, 'review');
    if (!$productId || !$rating || $rating < 1 || $rating > 5 || stringLength($review) > 1000) {
        respond(422, ['error' => 'أدخل تقييمًا من نجمة إلى خمس نجوم، ونصًا لا يتجاوز 1000 حرفًا.']);
    }

    $productQuery = $pdo->prepare('SELECT id FROM products WHERE id = :id AND is_active = 1 LIMIT 1');
    $productQuery->execute(['id' => $productId]);
    if (!$productQuery->fetch()) {
        respond(404, ['error' => 'المنتج غير موجود.']);
    }

    $eligibility = $pdo->prepare(
        "SELECT 1 FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = :user_id AND o.status = 'completed'
           AND oi.product_id = :product_id
         LIMIT 1"
    );
    $eligibility->execute(['user_id' => $user['id'], 'product_id' => $productId]);
    if (!$eligibility->fetchColumn()) {
        respond(403, ['error' => 'يمكنك تقييم المنتج بعد اكتمال طلب يحتوي عليه.']);
    }

    try {
        $insert = $pdo->prepare(
            'INSERT INTO product_reviews (product_id, user_id, rating, review_text)
             VALUES (:product_id, :user_id, :rating, :review)'
        );
        $insert->execute([
            'product_id' => $productId,
            'user_id' => $user['id'],
            'rating' => $rating,
            'review' => $review,
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            respond(409, ['error' => 'سبق أن قيّمت هذا المنتج.']);
        }
        throw $error;
    }

    respond(201, ['message' => 'تم حفظ تقييمك.']);
}

if ($route === 'contact' && $method === 'POST') {
    $input = readInput();
    $name = textValue($input, 'name');
    $email = strtolower(textValue($input, 'email'));
    $message = textValue($input, 'message');
    if ($name === '' || stringLength($name) > 120
        || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254
        || $message === '' || stringLength($message) > 5000) {
        respond(422, ['error' => 'تحقق من الاسم والبريد والرسالة (حتى 5000 حرف).']);
    }

    $insert = $pdo->prepare(
        'INSERT INTO contact_messages (name, email, message)
         VALUES (:name, :email, :message)'
    );
    $insert->execute(['name' => $name, 'email' => $email, 'message' => $message]);
    respond(201, ['message' => 'تم حفظ رسالتك في قاعدة البيانات.']);
}

if ($route === 'orders' && $method === 'GET') {
    $user = requireUser($pdo);
    $statement = $pdo->prepare(
        'SELECT o.id, o.status, o.customer_name AS customerName, o.phone, o.shipping_address AS shippingAddress,
                o.total, o.created_at AS createdAt,
                oi.product_name AS name, oi.quantity AS qty, oi.unit_price AS price
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = :user_id
         ORDER BY o.created_at DESC, o.id DESC, oi.id ASC'
    );
    $statement->execute(['user_id' => $user['id']]);
    $orders = [];
    foreach ($statement->fetchAll() as $row) {
        $id = (int) $row['id'];
        if (!isset($orders[$id])) {
            $orders[$id] = [
                'id' => $id,
                'status' => $row['status'],
                'customerName' => $row['customerName'],
                'phone' => $row['phone'],
                'shippingAddress' => $row['shippingAddress'],
                'total' => (float) $row['total'],
                'createdAt' => $row['createdAt'],
                'items' => [],
            ];
        }
        $orders[$id]['items'][] = [
            'name' => $row['name'],
            'qty' => (int) $row['qty'],
            'price' => (float) $row['price'],
        ];
    }
    respond(200, ['orders' => array_values($orders)]);
}

if ($route === 'orders' && $method === 'POST') {
    $user = requireUser($pdo);
    $input = readInput();
    $items = $input['items'] ?? null;
    $customerName = textValue($input, 'customerName');
    $phone = textValue($input, 'phone');
    $shippingAddress = textValue($input, 'shippingAddress');
    if ($customerName === '' || stringLength($customerName) > 120
        || !preg_match('/^[0-9+()\-\s]{8,30}$/', $phone)
        || $shippingAddress === '' || stringLength($shippingAddress) > 500) {
        respond(422, ['error' => 'أدخل اسم المستلم ورقم هاتف صحيحًا وعنوان توصيل واضحًا.']);
    }
    if (!is_array($items) || count($items) < 1 || count($items) > 50) {
        respond(422, ['error' => 'السلة فارغة أو تحتوي على عدد غير صالح من المنتجات.']);
    }

    $quantities = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            respond(422, ['error' => 'يوجد منتج أو كمية غير صالحة في السلة.']);
        }
        $productId = filter_var($item['id'] ?? null, FILTER_VALIDATE_INT);
        $quantity = filter_var($item['qty'] ?? null, FILTER_VALIDATE_INT);
        if (!$productId || !$quantity || $quantity < 1 || $quantity > 99) {
            respond(422, ['error' => 'يوجد منتج أو كمية غير صالحة في السلة.']);
        }
        $quantities[$productId] = ($quantities[$productId] ?? 0) + $quantity;
        if ($quantities[$productId] > 99) {
            respond(422, ['error' => 'الحد الأقصى لكل منتج هو 99 قطعة.']);
        }
    }

    $productsById = [];
    $productQuery = $pdo->prepare(
        'SELECT id, name, price FROM products WHERE id = :id AND is_active = 1 LIMIT 1'
    );
    $totalCents = 0;
    foreach ($quantities as $productId => $quantity) {
        $productQuery->execute(['id' => $productId]);
        $product = $productQuery->fetch();
        if (!$product) {
            respond(422, ['error' => 'أحد المنتجات لم يعد متاحًا. حدّث الصفحة ثم حاول مجددًا.']);
        }
        $product['quantity'] = $quantity;
        $unitCents = (int) round((float) $product['price'] * 100);
        $product['unitCents'] = $unitCents;
        $totalCents += $unitCents * $quantity;
        $productsById[$productId] = $product;
    }

    $pdo->beginTransaction();
    try {
        $orderInsert = $pdo->prepare(
            "INSERT INTO orders (user_id, status, payment_method, customer_name, phone, shipping_address, total)
             VALUES (:user_id, 'pending', 'none', :customer_name, :phone, :shipping_address, :total)"
        );
        $orderInsert->execute([
            'user_id' => $user['id'],
            'customer_name' => $customerName,
            'phone' => $phone,
            'shipping_address' => $shippingAddress,
            'total' => number_format($totalCents / 100, 2, '.', ''),
        ]);
        $orderId = (int) $pdo->lastInsertId();
        $itemInsert = $pdo->prepare(
            'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
             VALUES (:order_id, :product_id, :product_name, :quantity, :unit_price, :line_total)'
        );
        foreach ($productsById as $product) {
            $lineCents = $product['unitCents'] * $product['quantity'];
            $itemInsert->execute([
                'order_id' => $orderId,
                'product_id' => $product['id'],
                'product_name' => $product['name'],
                'quantity' => $product['quantity'],
                'unit_price' => number_format($product['unitCents'] / 100, 2, '.', ''),
                'line_total' => number_format($lineCents / 100, 2, '.', ''),
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    respond(201, [
        'order' => [
            'id' => $orderId,
            'status' => 'pending',
            'customerName' => $customerName,
            'phone' => $phone,
            'shippingAddress' => $shippingAddress,
            'total' => $totalCents / 100,
            'createdAt' => date('Y-m-d H:i:s'),
            'items' => array_map(
                static fn (array $product): array => [
                    'name' => $product['name'],
                    'qty' => $product['quantity'],
                    'price' => $product['unitCents'] / 100,
                ],
                array_values($productsById)
            ),
        ],
        'message' => 'تم تسجيل طلبك في قاعدة البيانات. لا يتم تحصيل أي مبلغ إلكترونيًا؛ سيتواصل المتجر لتأكيد الطلب.',
    ]);
}

if ($route === 'admin/dashboard' && $method === 'GET') {
    requireAdmin($pdo);
    $counts = $pdo->query(
        "SELECT
            (SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_active = 1) AS customers,
            (SELECT COUNT(*) FROM users WHERE role IN ('staff', 'manager', 'admin') AND is_active = 1) AS employees,
            (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
            (SELECT COUNT(*) FROM orders) AS orders,
            (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status <> 'cancelled') AS revenue"
    )->fetch();
    $recentOrders = $pdo->query(
        'SELECT o.id, o.status, o.total, o.created_at AS createdAt,
                o.customer_name AS recipientName, o.phone, o.shipping_address AS shippingAddress,
                u.full_name AS customerName, u.email AS customerEmail
         FROM orders o JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC, o.id DESC LIMIT 10'
    )->fetchAll();
    $recentUsers = $pdo->query(
        "SELECT id, username, full_name AS name, email, role, created_at AS createdAt
         FROM users ORDER BY created_at DESC, id DESC LIMIT 50"
    )->fetchAll();
    $productList = $pdo->query(
        'SELECT id, name, category, price, is_active AS isActive
         FROM products ORDER BY id DESC'
    )->fetchAll();
    $recentMessages = $pdo->query(
        'SELECT id, name, email, message, created_at AS createdAt
         FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT 20'
    )->fetchAll();
    respond(200, [
        'stats' => [
            'customers' => (int) $counts['customers'],
            'employees' => (int) $counts['employees'],
            'products' => (int) $counts['products'],
            'orders' => (int) $counts['orders'],
            'revenue' => (float) $counts['revenue'],
        ],
        'recentOrders' => $recentOrders,
        'recentUsers' => $recentUsers,
        'products' => $productList,
        'recentMessages' => $recentMessages,
    ]);
}

if ($route === 'admin/orders/status' && $method === 'PATCH') {
    requireAdmin($pdo);
    $input = readInput();
    $orderId = filter_var($input['orderId'] ?? null, FILTER_VALIDATE_INT);
    $status = textValue($input, 'status');
    $allowedStatuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
    if (!$orderId || !in_array($status, $allowedStatuses, true)) {
        respond(422, ['error' => 'رقم الطلب أو الحالة غير صالح.']);
    }

    $update = $pdo->prepare('UPDATE orders SET status = :status WHERE id = :id');
    $update->execute(['status' => $status, 'id' => $orderId]);
    if ($update->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT 1 FROM orders WHERE id = :id LIMIT 1');
        $exists->execute(['id' => $orderId]);
        if (!$exists->fetchColumn()) {
            respond(404, ['error' => 'الطلب غير موجود.']);
        }
    }
    respond(200, ['message' => 'تم تحديث حالة الطلب.']);
}

if ($route === 'auth/me' && $method === 'GET') {
    respond(200, ['user' => profileFromSession($pdo)]);
}

if ($route === 'auth/register' && $method === 'POST') {
    $input = readInput();
    $username = strtolower(textValue($input, 'username'));
    $name = textValue($input, 'name');
    $email = strtolower(textValue($input, 'email'));
    $password = is_string($input['password'] ?? null) ? $input['password'] : '';

    if (!preg_match('/^[A-Za-z0-9_.]{3,32}$/', $username)) {
        respond(422, ['error' => 'اسم المستخدم يجب أن يكون من 3 إلى 32 حرفًا إنجليزيًا أو رقمًا أو (.) أو (_).']);
    }
    if ($name === '' || stringLength($name) > 120) {
        respond(422, ['error' => 'الاسم مطلوب ويجب ألا يتجاوز 120 حرفًا.']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
        respond(422, ['error' => 'أدخل بريدًا إلكترونيًا صحيحًا.']);
    }
    $validPasswordLength = strlen($password) <= 72
        && preg_match('/^.{8,72}$/us', $password) === 1;
    if (!$validPasswordLength
        || !preg_match('/[A-Za-z]/', $password)
        || !preg_match('/[0-9]/', $password)) {
        respond(422, ['error' => 'كلمة المرور يجب أن تكون من 8 إلى 72 حرفًا، وأن تحتوي على حرف إنجليزي ورقم على الأقل.']);
    }

    try {
        $statement = $pdo->prepare(
            "INSERT INTO users (username, full_name, email, password_hash, role)
             VALUES (:username, :full_name, :email, :password_hash, 'customer')"
        );
        $statement->execute([
            'username' => $username,
            'full_name' => $name,
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            respond(409, ['error' => 'اسم المستخدم أو البريد الإلكتروني مسجل بالفعل.']);
        }
        throw $error;
    }

    session_regenerate_id(true);
    $user = [
        'id' => (int) $pdo->lastInsertId(),
        'type' => 'customer',
        'username' => $username,
        'name' => $name,
        'email' => $email,
        'bio' => '',
        'city' => '',
        'work' => '',
        'role' => 'customer',
        'isAdmin' => false,
    ];
    saveProfile($user);
    respond(201, ['user' => $user, 'message' => 'تم إنشاء الحساب بنجاح.']);
}

if ($route === 'auth/login' && $method === 'POST') {
    $input = readInput();
    $identifier = textValue($input, 'identifier');
    $password = is_string($input['password'] ?? null) ? $input['password'] : '';

    if ($identifier === '' || $password === '') {
        respond(422, ['error' => 'أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور.']);
    }

    $column = str_contains($identifier, '@') ? 'email' : 'username';
    $loginQuery = $pdo->prepare(
        "SELECT id, username, full_name, email, password_hash, bio, city, job_title AS work, role
         FROM users WHERE {$column} = :identifier AND is_active = 1 LIMIT 1"
    );
    $loginQuery->execute(['identifier' => $identifier]);
    $row = $loginQuery->fetch();
    $role = $row['role'] ?? 'customer';
    $type = $role === 'customer' ? 'customer' : 'employee';

    if (!$row || !password_verify($password, $row['password_hash'])) {
        respond(401, ['error' => 'اسم المستخدم أو كلمة المرور غير صحيحة.']);
    }

    session_regenerate_id(true);
    $user = [
        'id' => (int) $row['id'],
        'type' => $type,
        'username' => $row['username'],
        'name' => $row['full_name'],
        'email' => $row['email'],
        'bio' => $row['bio'] ?? '',
        'city' => $row['city'] ?? '',
        'work' => $row['work'] ?? '',
        'role' => $role,
        'isAdmin' => in_array($role, ['manager', 'admin'], true),
    ];
    saveProfile($user);
    respond(200, ['user' => $user, 'message' => 'تم تسجيل الدخول بنجاح.']);
}

if ($route === 'auth/logout' && $method === 'POST') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    respond(200, ['message' => 'تم تسجيل الخروج.']);
}

if ($route === 'profile' && $method === 'PUT') {
    $user = profileFromSession($pdo);
    if (!$user) {
        respond(401, ['error' => 'سجّل الدخول أولًا.']);
    }

    $input = readInput();
    $name = textValue($input, 'name');
    $email = strtolower(textValue($input, 'email'));
    $bio = textValue($input, 'bio');
    $city = textValue($input, 'city');
    $work = textValue($input, 'work');
    if ($name === '' || stringLength($name) > 120
        || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254
        || stringLength($bio) > 180 || stringLength($city) > 80 || stringLength($work) > 100) {
        respond(422, ['error' => 'تحقق من الاسم والبريد والحد الأقصى لطول بيانات الملف الشخصي.']);
    }

    $statement = $pdo->prepare(
        'UPDATE users
         SET full_name = :name, email = :email, bio = :bio, city = :city, job_title = :work
         WHERE id = :id AND is_active = 1'
    );
    try {
        $statement->execute([
            'name' => $name,
            'email' => $email,
            'bio' => $bio,
            'city' => $city,
            'work' => $work,
            'id' => $user['id'],
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            respond(409, ['error' => 'هذا البريد الإلكتروني مرتبط بحساب آخر.']);
        }
        throw $error;
    }

    $user = array_merge($user, ['name' => $name, 'email' => $email, 'bio' => $bio, 'city' => $city, 'work' => $work]);
    saveProfile($user);
    respond(200, ['user' => $user, 'message' => 'تم حفظ بيانات الملف الشخصي.']);
}

respond(404, ['error' => 'المسار المطلوب غير موجود.']);
