<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit("Not found\n");
}

$config = require __DIR__ . '/config.php';
$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['host'], $config['database']),
    $config['username'],
    $config['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$existing = $pdo->query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")->fetchColumn();
if ($existing) {
    fwrite(STDERR, "An active admin account already exists. No account was created.\n");
    exit(1);
}

$suffix = bin2hex(random_bytes(5));
$username = 'admin_' . $suffix;
$email = 'admin-' . $suffix . '@example.invalid';
$password = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');

$statement = $pdo->prepare(
    "INSERT INTO users (username, full_name, email, password_hash, role)
     VALUES (:username, 'مدير المتجر', :email, :password_hash, 'admin')"
);
$statement->execute([
    'username' => $username,
    'email' => $email,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);

fwrite(STDOUT, "Admin account created. Save these credentials now:\n");
fwrite(STDOUT, "Username: {$username}\n");
fwrite(STDOUT, "Password: {$password}\n");
