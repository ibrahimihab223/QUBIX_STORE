let products = [];

let categories = ["الكل"];
const brandName = "QUBIX";
const brandSubtitle = "متجر إلكتروني";

function readLegacyList(key, legacyKey) {
    try {
        const currentValue = localStorage.getItem(key);
        const value = currentValue === null ? localStorage.getItem(legacyKey) : currentValue;
        if (currentValue === null && value !== null) localStorage.setItem(key, value);
        const data = JSON.parse(value || "[]");
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

const state = {
    cart: readLegacyList("qubix_cart", "nexashop_demo_cart"),
    favorites: readLegacyList("qubix_favorites", "online_store_favorites"),
    orders: [],
    profile: null,
    storeStats: null,
    productReviews: [],
    canReviewProduct: false,
    reviewLoading: false,
    reviewMessage: "",
    contactLoading: false,
    dashboardData: null,
    dashboardLoading: false,
    dashboardError: "",
    ordersLoading: false,
    ordersError: "",
    checkoutLoading: false,
    checkoutDraft: { customerName: "", phone: "", shippingAddress: "" },
    checkoutError: false,
    category: "الكل",
    query: new URLSearchParams(location.search).get("q") || "",
    cartOpen: false,
    checkoutMessage: "",
    contactError: false,
    contactMessage: "",
    noticeError: false,
    authMode: "login",
    authDraft: {},
    authLoading: false,
    notice: "",
    favoriteNotice: "",
    apiError: "",
};

let favoriteNoticeTimer;

async function apiRequest(route, { method = "GET", body, query = {} } = {}) {
    if (location.protocol === "file:") {
        throw new Error("شغّل Apache وMySQL من XAMPP وافتح الموقع عبر http://localhost؛ فتح ملف HTML مباشرة لا يدعم الاتصال بقاعدة البيانات.");
    }

    let response;
    try {
        const searchParams = new URLSearchParams({ route, ...query });
        response = await fetch(`../backend/api.php?${searchParams}`, {
            method,
            credentials: "same-origin",
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (error) {
        throw new Error("تعذر الوصول إلى الخادم. شغّل Apache وMySQL وافتح الموقع عبر http://localhost، وليس بفتح ملف HTML مباشرة.");
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("أرسل الخادم استجابة غير صالحة. راجع إعداد PHP وملفات الخادم.");
    }
    if (!response.ok) throw new Error(data.error || "تعذر إكمال الطلب.");
    state.apiError = "";
    return data;
}

function storedProfilePhoto(user) {
    try {
        const key = `qubix_profile_photo_${user.type}_${user.id}`;
        const legacyKey = `nexashop_profile_photo_${user.type}_${user.id}`;
        const photo = localStorage.getItem(key) || localStorage.getItem(legacyKey) || "";
        if (photo && !localStorage.getItem(key)) localStorage.setItem(key, photo);
        return photo;
    } catch {
        return "";
    }
}

async function loadApplicationData() {
    try {
        const [productData, authData] = await Promise.all([
            apiRequest("products"),
            apiRequest("auth/me"),
        ]);
        products = productData.products.map((item) => ({
            ...item,
            id: Number(item.id),
            price: Number(item.price),
            rating: Number(item.rating),
            reviewCount: Number(item.reviewCount),
        }));
        categories = ["الكل", ...new Set(products.map((item) => item.category))];
        state.cart = state.cart.map((item) => {
            const product = products.find((entry) => entry.id === Number(item.id));
            const quantity = Number(item.qty);
            return product && Number.isInteger(quantity) && quantity > 0 && quantity <= 99
                ? { id: product.id, name: product.name, price: product.price, qty: quantity }
                : null;
        }).filter(Boolean);
        persist();
        state.storeStats = productData.stats;
        state.profile = authData.user ? { ...authData.user, photo: storedProfilePhoto(authData.user) } : null;
        state.apiError = "";
        await loadUserData();
        await loadProductReviews();
    } catch (error) {
        state.apiError = error.message;
    }
    render();
}

async function loadProductReviews() {
    const productId = Number(new URLSearchParams(location.search).get("id"));
    if (document.body.dataset.page !== "product" || !Number.isInteger(productId) || productId < 1) return;

    state.reviewLoading = true;
    try {
        const result = await apiRequest("product/reviews", { query: { id: String(productId) } });
        state.productReviews = result.reviews;
        state.canReviewProduct = result.canReview;
        state.reviewMessage = "";
    } catch (error) {
        state.reviewMessage = error.message;
    } finally {
        state.reviewLoading = false;
        render();
    }
}

async function loadUserData() {
    state.orders = [];
    state.dashboardData = null;
    state.dashboardError = "";
    state.ordersError = "";
    if (!state.profile) return;

    state.ordersLoading = true;
    const requests = [apiRequest("orders")];
    if (state.profile.isAdmin) {
        state.dashboardLoading = true;
        requests.push(apiRequest("admin/dashboard"));
    }

    const [ordersResult, dashboardResult] = await Promise.allSettled(requests);
    state.ordersLoading = false;
    if (ordersResult.status === "fulfilled") {
        state.orders = ordersResult.value.orders;
    } else {
        state.ordersError = ordersResult.reason.message;
    }
    if (state.profile.isAdmin) {
        state.dashboardLoading = false;
        if (dashboardResult.status === "fulfilled") {
            state.dashboardData = dashboardResult.value;
        } else {
            state.dashboardError = dashboardResult.reason.message;
        }
    }
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
}

function money(value) {
    return Number(value || 0).toLocaleString("ar-EG");
}

function icon(name, size = 18, fill = false) {
    const paths = {
        arrowLeft: '<path d="M19 12H5m7 7-7-7 7-7"/>',
        arrowRight: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
        cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
        orders: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        close: '<path d="m18 6-12 12M6 6l12 12"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
        truck: '<path d="M10 17h4V5H2v12h3m9 0h3m0-7h4l3 3v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/>',
        shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
        badge: '<circle cx="12" cy="9" r="7"/><path d="m8 14-1 8 5-3 5 3-1-8M9 9l2 2 4-4"/>',
        sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3ZM19 14l1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z"/>',
        percent: '<path d="m19 5-14 14"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
        trash: '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>',
        bag: '<path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
        mapPin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
        briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75"/><circle cx="10" cy="7" r="4"/>',
        camera: '<path d="M14 5h-4L8 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-2-2Z"/><circle cx="12" cy="13" r="3"/>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.7L7.7 9.5a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.5a2 2 0 0 1 1.5 2.8Z"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${fill ? ' fill="currentColor"' : ""} aria-hidden="true">${paths[name] || ""}</svg>`;
}

function link(path, label, className = "") {
    const destinations = {
        "/": "index.html",
        "/?section=products": "index.html?section=products#products",
        "/offers": "offers.html",
        "/favorites": "favorites.html",
        "/auth": "auth.html",
        "/orders": "orders.html",
        "/contact": "contact.html",
        "/admin": "admin.html",
    };
    const productRoute = path.match(/^\/product\/(\d+)$/);
    const href = productRoute
        ? `product.html?id=${productRoute[1]}`
        : destinations[path] || "index.html";
    return `<a href="${href}"${className ? ` class="${className}"` : ""}>${label}</a>`;
}

function pageActions() {
    return '<div class="page-actions"><button type="button" class="secondary-link-btn" data-action="back">العودة للصفحة السابقة</button></div>';
}

function searchSuggestions() {
    if (!state.query || document.body.dataset.page === "home") return "";
    const matches = products
        .filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()))
        .slice(0, 6);
    if (!matches.length) return '<div class="search-results"><p>لا توجد نتائج مطابقة.</p></div>';
    return `<div class="search-results" role="listbox" aria-label="نتائج البحث">${matches.map((product) =>
        `<a role="option" href="product.html?id=${product.id}"><span>${esc(product.name)}<small>${esc(product.category)}</small></span><strong>${money(product.price)} ج.م</strong></a>`
    ).join("")}<button type="submit" class="search-all-results">عرض كل النتائج</button></div>`;
}

function header() {
    const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
    return `<header class="topbar"><div class="container nav-bar">
    <div class="brand-wrap">${link("/", `<div class="brand-logo">Q</div><div><strong>${brandName}</strong><span>${brandSubtitle}</span></div>`, "brand-link")}</div>
    <nav class="desktop-nav mobile-nav" aria-label="التنقل الرئيسي">${link("/", "الرئيسية")}${link("/?section=products", "المنتجات")}${link("/offers", "كل المنتجات")}${link("/orders", "طلباتي")}${link("/favorites", "المفضلة")}${state.profile?.isAdmin ? link("/admin", "الإدارة") : ""}${link("/contact", "تواصل معنا")}</nav>
    <form class="search-box" data-form="search" role="search">${icon("search")}<input id="product-search" value="${esc(state.query)}" placeholder="ابحث عن منتج أو تصنيف..." aria-label="بحث المنتجات" autocomplete="off">${searchSuggestions()}</form>
    <div class="action-group">
      <a href="favorites.html" class="icon-button" aria-label="المفضلة">${icon("heart")}${state.favorites.length ? `<span class="favorite-count">${state.favorites.length}</span>` : ""}</a>
      <button type="button" class="icon-button cart-button" data-action="open-cart" aria-label="السلة">${icon("cart")}<span>${count}</span></button>
      <a href="orders.html" class="icon-button orders-button" aria-label="طلباتي">${icon("orders")}</a>
      <a href="auth.html" class="icon-button" aria-label="${state.profile ? `حساب ${esc(state.profile.name || state.profile.username)}` : "حساب المستخدم"}">${icon("user")}</a>
      <button type="button" class="icon-button mobile-only" data-action="mobile-menu" aria-label="القائمة">${icon("menu")}</button>
    </div>
  </div></header>`;
}

function footer() {
    return `<footer class="footer"><div class="container footer-inner">
    <div><b>${brandName}</b><p>كتالوج المنتجات وأسعارها من قاعدة بيانات المتجر.</p></div>
    <div><b>روابط المتجر</b>${link("/", "الرئيسية")}${link("/auth", "الحساب")}${link("/offers", "كل المنتجات")}</div>
    <div><b>التواصل</b>${link("/contact", "إرسال رسالة")}</div>
  </div></footer>`;
}

function card(product) {
    const favorite = state.favorites.some((item) => Number(item.id) === product.id);
    const rating = product.reviewCount > 0
        ? `<div class="rating-row">${icon("star", 15, true)}<span>${product.rating.toFixed(1)}</span><small>(${money(product.reviewCount)})</small></div>`
        : '<div class="rating-row rating-empty">لا توجد تقييمات بعد</div>';
    return `<article class="product-card"><button type="button" class="wishlist-btn${favorite ? " is-favorite" : ""}" data-action="favorite" data-id="${product.id}" aria-label="${favorite ? "حذف من المفضلة" : "إضافة للمفضلة"}" aria-pressed="${favorite}" title="${favorite ? "حذف من المفضلة" : "إضافة للمفضلة"}">${icon("heart", 18, favorite)}</button>
    <div class="product-image"><img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy"></div>
    <div class="product-body"><span class="category-tag">${esc(product.category)}</span><h3>${esc(product.name)}</h3>
      ${rating}
      <div class="price-row"><strong>${money(product.price)} ج.م</strong></div>
      ${link(`/product/${product.id}`, "تفاصيل المنتج", "secondary-link-btn")}
      <button type="button" class="add-btn" data-action="add-cart" data-id="${product.id}">أضف إلى السلة</button>
    </div></article>`;
}

function homePage() {
    const visible = products.filter((product) => {
        const text = `${product.name} ${product.category}`.toLowerCase();
        return text.includes(state.query.toLowerCase()) &&
            (state.category === "الكل" || state.category === product.category);
    });
    const features = [
        ["search", "بحث فوري", "ابحث في المنتجات المسجلة"],
        ["heart", "قائمة المفضلة", "تُحفظ على هذا الجهاز"],
        ["orders", "طلبات محفوظة", "تُسجّل في قاعدة البيانات"],
        ["star", "تقييم المشترين", "بعد اكتمال الطلب"],
    ];
    const counts = products.reduce((map, item) => {
        map[item.category] = (map[item.category] || 0) + 1;
        return map;
    }, {});
    const stats = state.storeStats || { customers: 0, products: products.length, completedOrders: 0 };
    const featuredProduct = products[0];
    return `<main>
    <section class="hero container"><div class="hero-copy"><span class="pill">${money(stats.products)} منتج متاح</span><h1>اختيارات تناسبك، <em>بكل وضوح</em></h1>
      <p>استكشف المنتجات المتاحة وأسعارها المسجلة في المتجر، وابحث أو أضف ما تريد إلى قائمتك.</p>
      <div class="hero-actions">${link("/?section=products", `تسوق الآن ${icon("arrowLeft")}`, "primary-btn")}${link("/offers", `تصفح المنتجات ${icon("arrowRight")}`, "secondary-btn")}</div>
      <div class="stats-row"><div><strong>${money(stats.customers)}</strong><span>حساب عميل مسجل</span></div><div><strong>${money(stats.completedOrders)}</strong><span>طلب مكتمل</span></div><div><strong>${money(stats.reviews || 0)}</strong><span>تقييم محفوظ</span></div></div>
    </div>${featuredProduct ? `<a href="product.html?id=${featuredProduct.id}" class="hero-card hero-watch-card"><div class="watch-visual"><img src="${esc(featuredProduct.image)}" alt="${esc(featuredProduct.name)}" fetchpriority="high"></div><div class="product-meta"><b>${esc(featuredProduct.name)}</b><small>${esc(featuredProduct.category)}</small></div><div class="offer-price"><span>${money(featuredProduct.price)} ج.م</span></div><span class="watch-cta">عرض المنتج ${icon("arrowLeft", 16)}</span></a>` : ""}</section>
    <section class="features container">${features.map(([symbol, title, text]) => `<div class="feature-item"><div class="feature-icon">${icon(symbol, 22)}</div><div><b>${title}</b><span>${text}</span></div></div>`).join("")}</section>
    <section class="container spotlight-section"><div class="section-header"><div><small>تسوق حسب الفئة</small><h2>اكتشف فئاتنا المميزة</h2></div></div>
      <div class="spotlight-grid">${categories.filter((name) => name !== "الكل").map((name) => `<button type="button" class="spotlight-card" data-action="category" data-category="${esc(name)}"><span>${esc(name)}</span><small>${counts[name] || 0} منتج</small></button>`).join("")}</div></section>
    <section id="products" class="container content-section"><div class="section-header"><div><small>كتالوج المتجر</small><h2>المنتجات</h2></div><a href="index.html?section=products#products" class="link-btn">عرض الكل ${icon("arrowLeft", 16)}</a></div>
      <div class="category-pills">${categories.map((name) => `<button type="button" class="pill${state.category === name ? " active" : ""}" data-action="category" data-category="${esc(name)}">${esc(name)}</button>`).join("")}</div>
      <div class="product-grid">${visible.length ? visible.map(card).join("") : '<div class="empty-state">لا توجد منتجات مطابقة لبحثك.</div>'}</div>
    </section>
    <section class="promo-banner container"><div><small>عن QUBIX</small><h2>المنتجات والأسعار من قاعدة البيانات</h2><p>تُحدّث بيانات الكتالوج من مخزون المتجر المسجل.</p></div>${link("/offers", `تصفح المنتجات ${icon("arrowLeft")}`, "primary-btn")}</section>
  </main>`;
}

function offersPage() {
    return `<main class="container page-shell offers-page">${pageActions()}<div class="page-intro"><span class="eyebrow">من قاعدة بيانات المتجر</span><h1>كل المنتجات</h1><p>الأسعار الحالية كما أدخلها مدير المتجر في قاعدة البيانات.</p></div>
    ${products.length ? `<div class="product-grid">${products.map(card).join("")}</div>` : '<div class="empty-state">لا توجد منتجات نشطة في قاعدة البيانات.</div>'}</main>`;
}

function productPage(id) {
    const product = products.find((item) => item.id === Number(id));
    if (!product) return '<main class="container page-shell"><div class="empty-state">المنتج غير موجود</div></main>';
    const isFavorite = state.favorites.some((item) => Number(item.id) === product.id);
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
    const rating = product.reviewCount > 0
        ? `<div class="rating-row product-rating">${icon("star", 17, true)}<strong>${product.rating.toFixed(1)}</strong><span>${money(product.reviewCount)} تقييم</span></div>`
        : '<div class="rating-row product-rating rating-empty">لا توجد تقييمات بعد</div>';
    return `<main class="container page-shell product-detail-page">
      <div class="page-actions product-breadcrumb"><button type="button" class="secondary-link-btn" data-action="back">${icon("arrowRight", 16)} العودة للمتجر</button><span>الرئيسية</span><span>/</span><span>${esc(product.category)}</span><span>/</span><b>${esc(product.name)}</b></div>
      <article class="product-detail-card">
        <div class="product-detail-image">
          <button type="button" class="product-detail-favorite${isFavorite ? " is-favorite" : ""}" data-action="favorite" data-id="${product.id}" aria-label="${isFavorite ? "حذف من المفضلة" : "إضافة للمفضلة"}" aria-pressed="${isFavorite}" title="${isFavorite ? "حذف من المفضلة" : "إضافة للمفضلة"}">${icon("heart", 20, isFavorite)}</button>
          <img src="${esc(product.image)}" alt="${esc(product.name)}">
        </div>
        <div class="product-detail-body">
          <div class="product-detail-kicker"><span class="category-tag">${esc(product.category)}</span></div>
          <h1>${esc(product.name)}</h1>
          ${rating}
          <div class="product-price-block"><strong>${money(product.price)} <small>ج.م</small></strong></div>
          <p class="product-description">${esc(product.description)}</p>
          <div class="product-detail-benefits"><div>${icon("bag", 20)}<span><b>طلب مسجل</b><small>يُحفظ في قاعدة بيانات المتجر</small></span></div><div>${icon("star", 20)}<span><b>تقييم حقيقي</b><small>بعد اكتمال شراء المنتج</small></span></div></div>
          <div class="product-detail-actions"><button type="button" class="primary-btn product-buy-btn" data-action="add-cart" data-id="${product.id}">${icon("cart", 19)} أضف إلى السلة</button><button type="button" class="secondary-link-btn product-save-btn${isFavorite ? " is-favorite" : ""}" data-action="favorite" data-id="${product.id}" aria-pressed="${isFavorite}">${icon("heart", 18, isFavorite)} ${isFavorite ? "إزالة من المفضلة" : "أضف للمفضلة"}</button></div>
          <p class="product-detail-note">الأسعار بالجنيه المصري كما هي مسجلة في قاعدة بيانات المتجر. لا يتم تحصيل الدفع إلكترونيًا.</p>
        </div>
      </article>
      ${productReviewsSection(product)}
      ${related.length ? `<section class="related-products"><div class="section-header"><div><small>تسوق المزيد</small><h2>منتجات من نفس الفئة</h2></div><a href="index.html?section=products#products" class="link-btn">كل المنتجات ${icon("arrowLeft", 16)}</a></div><div class="product-grid">${related.map(card).join("")}</div></section>` : ""}
    </main>`;
}

function productReviewsSection(product) {
    const reviews = state.productReviews.map((review) => `<article class="review-card">
      <div class="review-heading"><strong>مشتري</strong><span class="rating-row">${icon("star", 15, true)} ${esc(review.rating)}/5</span></div>
      <p>${esc(review.review || "تقييم بدون تعليق.")}</p><small>${esc(review.createdAt)}</small>
    </article>`).join("");
    const reviewForm = state.canReviewProduct
        ? `<form class="review-form" data-form="review"><label>تقييمك<select name="rating" required><option value="">اختر عدد النجوم</option><option value="5">5 - ممتاز</option><option value="4">4 - جيد جدًا</option><option value="3">3 - جيد</option><option value="2">2 - مقبول</option><option value="1">1 - ضعيف</option></select></label><label>تعليقك (اختياري)<textarea name="review" maxlength="1000" rows="4" placeholder="شارك تجربتك الفعلية مع المنتج"></textarea></label>${state.reviewMessage ? `<div class="api-error" role="alert">${esc(state.reviewMessage)}</div>` : ""}<button type="submit" class="primary-btn" ${state.reviewLoading ? "disabled" : ""}>إرسال التقييم</button></form>`
        : state.profile
            ? '<p class="payment-note">يمكنك إضافة تقييم واحد بعد اكتمال طلب يحتوي على هذا المنتج.</p>'
            : `<p class="payment-note">${link("/auth", "سجّل الدخول")}، ثم أضف تقييمك بعد اكتمال شراء هذا المنتج.</p>`;
    return `<section class="reviews-section"><div class="section-header"><div><small>من المشترين</small><h2>تقييمات المنتج (${money(product.reviewCount)})</h2></div></div>
      ${state.reviewLoading ? '<p class="empty-state">جارٍ تحميل التقييمات...</p>' : reviews || '<p class="empty-state">لا توجد تقييمات لهذا المنتج حتى الآن.</p>'}
        ${state.reviewMessage && !state.canReviewProduct ? `<div class="${state.reviewMessage.startsWith("تم") ? "success-box" : "api-error"}" role="${state.reviewMessage.startsWith("تم") ? "status" : "alert"}">${esc(state.reviewMessage)}</div>` : reviewForm}
    </section>`;
}
function favoritesPage() {
    const items = state.favorites.map((saved) => products.find((product) => product.id === Number(saved.id))).filter(Boolean);
    return `<main class="container page-shell favorites-page">${pageActions()}<div class="page-intro"><span class="eyebrow">قائمة شخصية</span><h1>المفضلة</h1><p>احتفظ بالمنتجات التي تريد الرجوع إليها لاحقًا.</p></div>
    ${items.length ? `<div class="favorites-grid">${items.map((product) => `<article class="favorite-card"><div class="product-image"><img src="${esc(product.image)}" alt="${esc(product.name)}"></div><div><span class="category-tag">${esc(product.category)}</span><h2>${esc(product.name)}</h2><strong>${money(product.price)} ج.م</strong><div class="favorite-actions"><button type="button" class="add-btn" data-action="add-cart" data-id="${product.id}">${icon("cart", 16)} أضف للسلة</button><button type="button" class="icon-button" data-action="favorite" data-id="${product.id}" aria-label="حذف من المفضلة">${icon("trash", 17)}</button>${link(`/product/${product.id}`, "التفاصيل", "secondary-link-btn")}</div></div></article>`).join("")}</div>` : '<div class="empty-state">لم تضف منتجات للمفضلة بعد.</div>'}</main>`;
}

function authPage() {
    if (state.profile) {
        const profile = state.profile;
        const initials = esc((profile.name || profile.username || "م").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join(""));
        const avatar = profile.photo
            ? `<img src="${esc(profile.photo)}" alt="الصورة الشخصية لـ ${esc(profile.name)}">`
            : `<span>${initials}</span>`;
        return `<main class="container page-shell profile-page">
          <section class="social-profile-card">
            <div class="profile-cover"><span class="cover-label">${icon("sparkles", 16)} مساحتك الشخصية</span></div>
            <div class="profile-identity">
              <label class="profile-avatar" title="تغيير الصورة الشخصية">${avatar}<span class="avatar-camera">${icon("camera", 17)}</span><input id="profile-photo" type="file" accept="image/*" aria-label="اختيار صورة شخصية"></label>
              <div class="profile-identity-copy"><span class="eyebrow">الملف الشخصي</span><h1>${esc(profile.name || profile.username)}</h1><p>@${esc(profile.username)}${profile.city ? ` · ${esc(profile.city)}` : ""}</p><small>${profile.bio ? esc(profile.bio) : "أضف نبذة بسيطة لتعرّف الناس عليك."}</small></div>
              <div class="profile-identity-actions"><button type="button" class="secondary-link-btn" data-action="edit-profile">${icon("user", 17)} تعديل البيانات</button><button type="button" class="secondary-link-btn" data-action="logout">تسجيل الخروج</button></div>
            </div>
            <nav class="profile-tabs" aria-label="أقسام الملف الشخصي"><a href="#profile-about">نبذة عني</a><a href="#profile-details">بياناتي</a></nav>
          </section>
          <div class="profile-content-grid">
            <aside class="profile-side-column">
              <section class="profile-panel profile-intro-panel" id="profile-about"><h2>${icon("user", 19)} نبذة عني</h2><p class="profile-bio">${profile.bio ? esc(profile.bio) : "أضف نبذة بسيطة عن نفسك لتظهر هنا."}</p>
                <div class="profile-info-list">${profile.city ? `<div>${icon("mapPin", 17)}<span>يقيم في <b>${esc(profile.city)}</b></span></div>` : ""}${profile.work ? `<div>${icon("briefcase", 17)}<span>${profile.type === "employee" ? "يعمل في" : "يعمل أو يدرس في"} <b>${esc(profile.work)}</b></span></div>` : ""}<div>${icon("users", 17)}<span>${profile.type === "employee" ? `موظف في ${brandName}` : `عضو في ${brandName}`}</span></div></div>
                <button type="button" class="profile-edit-link" data-action="edit-profile">تعديل التفاصيل</button>
              </section>
              <section class="profile-panel profile-details-panel" id="profile-details"><h2>البيانات الشخصية</h2><div class="profile-detail-row"><span>اسم المستخدم</span><b>@${esc(profile.username)}</b></div><div class="profile-detail-row"><span>البريد الإلكتروني</span><b>${esc(profile.email || "غير مضاف")}</b></div><div class="profile-detail-row"><span>المدينة</span><b>${esc(profile.city || "غير مضافة")}</b></div><div class="profile-detail-row"><span>العمل</span><b>${esc(profile.work || "غير مضاف")}</b></div></section>
            </aside>
            <div class="profile-main-column">
              <section class="profile-panel profile-editor" id="profile-editor"><div class="profile-panel-heading"><div><span class="eyebrow">إدارة حسابك</span><h2>تعديل الملف الشخصي</h2></div><span class="profile-edit-icon">${icon("user", 18)}</span></div>
                <form class="profile-edit-form" data-form="profile"><label>الاسم الظاهر<input name="name" maxlength="120" required value="${esc(profile.name || profile.username)}"></label><label>البريد الإلكتروني<input type="email" name="email" maxlength="254" value="${esc(profile.email || "")}" placeholder="name@example.com"></label><label>النبذة الشخصية<textarea name="bio" maxlength="180" rows="3" placeholder="اكتب نبذة قصيرة عنك...">${esc(profile.bio || "")}</textarea></label><div class="inline-fields"><label>المدينة<input name="city" maxlength="80" value="${esc(profile.city || "")}" placeholder="مثال: القاهرة"></label><label>العمل أو الدراسة<input name="work" maxlength="100" value="${esc(profile.work || "")}" placeholder="أين تعمل أو تدرس؟"></label></div>${state.notice ? `<div class="${state.noticeError ? "api-error" : "success-box"}" role="${state.noticeError ? "alert" : "status"}">${esc(state.notice)}</div>` : ""}<button type="submit" class="primary-btn">${icon("badge", 17)} حفظ التغييرات</button></form>
              </section>
              ${link("/", `العودة للتسوق ${icon("arrowLeft", 17)}`, "primary-btn profile-shop-link")}
            </div>
          </div>
        </main>`;
    }
    return `<main class="container page-shell auth-page"><div class="auth-card">${pageActions()}
    <div class="auth-header"><button type="button" class="mode-btn${state.authMode === "login" ? " active" : ""}" data-action="auth-mode" data-mode="login">تسجيل الدخول</button><button type="button" class="mode-btn${state.authMode === "register" ? " active" : ""}" data-action="auth-mode" data-mode="register">إنشاء حساب</button></div>
    <p class="payment-note">${state.authMode === "login" ? "أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور المسجلين." : "اسم المستخدم: 3-32 حرفًا إنجليزيًا أو رقمًا أو (.) أو (_). كلمة المرور: 8-72 حرفًا، وبها حرف إنجليزي ورقم على الأقل."}</p>
    <form class="auth-form" data-form="auth">${state.authMode === "register" ? `<label>الاسم الكامل<input name="name" placeholder="الاسم الكامل" maxlength="120" value="${esc(state.authDraft.name || "")}" required></label><label>البريد الإلكتروني<input type="email" name="email" placeholder="name@example.com" maxlength="254" value="${esc(state.authDraft.email || "")}" required></label>` : ""}
      <label>${state.authMode === "login" ? "اسم المستخدم أو البريد الإلكتروني" : "اسم المستخدم"}<input name="${state.authMode === "login" ? "identifier" : "username"}" placeholder="${state.authMode === "login" ? "username أو name@example.com" : "اسم المستخدم"}" minlength="${state.authMode === "register" ? "3" : "1"}" maxlength="${state.authMode === "register" ? "32" : "254"}" pattern="${state.authMode === "register" ? "[A-Za-z0-9_.]{3,32}" : ".*"}" autocomplete="username" value="${esc(state.authDraft[state.authMode === "login" ? "identifier" : "username"] || "")}" required></label>
      <label>كلمة المرور<input type="password" name="password" placeholder="كلمة المرور" minlength="${state.authMode === "register" ? "8" : "1"}" maxlength="${state.authMode === "register" ? "72" : "254"}" autocomplete="${state.authMode === "login" ? "current-password" : "new-password"}" ${state.authMode === "register" ? 'pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,72}"' : ""} required></label>
      ${state.authMode === "register" ? '<label>تأكيد كلمة المرور<input type="password" name="password_confirmation" placeholder="أعد كتابة كلمة المرور" minlength="8" maxlength="72" autocomplete="new-password" required></label>' : ""}
      ${state.notice ? `<div class="error-box" role="alert">${esc(state.notice)}</div>` : ""}<button type="submit" class="primary-btn full-width" ${state.authLoading ? "disabled" : ""}>${state.authLoading ? "جارٍ التحقق..." : state.authMode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}</button></form>
  </div></main>`;
}

function ordersPage() {
    const statusNames = { pending: "قيد المراجعة", processing: "قيد التجهيز", shipped: "تم الشحن", completed: "مكتمل", cancelled: "ملغي" };
    if (!state.profile) {
        return `<main class="container page-shell orders-page">${pageActions()}<div class="empty-state">سجّل الدخول لعرض الطلبات المرتبطة بحسابك. ${link("/auth", "تسجيل الدخول", "primary-btn")}</div></main>`;
    }
    return `<main class="container page-shell orders-page">${pageActions()}<div class="section-header"><div><small>طلباتك المحفوظة في قاعدة البيانات</small><h2>طلباتي</h2></div>${link("/", "العودة للرئيسية", "secondary-link-btn")}</div>
    ${state.ordersError ? `<div class="api-error" role="alert">${esc(state.ordersError)}</div>` : ""}
    ${state.ordersLoading ? '<div class="empty-state">جارٍ تحميل الطلبات...</div>' : state.orders.length ? `<div class="orders-list">${state.orders.map((order) => `<article class="order-card"><div class="order-topline"><span>طلب رقم #${esc(order.id)}</span><span class="status-pill">${statusNames[order.status] || esc(order.status)}</span></div><small>${esc(order.createdAt || "")}</small><div class="order-items">${order.items.map((item) => `<div class="order-item-row"><span>${esc(item.name)}</span><b>${item.qty} × ${money(item.price)} ج.م</b></div>`).join("")}</div><div class="order-summary"><span>الإجمالي</span><strong>${money(order.total)} ج.م</strong></div><p class="order-shipping-details">المستلم: ${esc(order.customerName)} · الهاتف: ${esc(order.phone)}<br>العنوان: ${esc(order.shippingAddress)}</p></article>`).join("")}</div>` : '<div class="empty-state">لا توجد طلبات في حسابك حتى الآن.</div>'}</main>`;
}

function contactPage() {
    return `<main class="container page-shell contact-page">${pageActions()}<div class="page-intro"><span class="eyebrow">تُحفظ الرسائل في قاعدة البيانات</span><h1>تواصل مع ${brandName}</h1><p>أرسل استفسارك وسيتم حفظه ليتمكن فريق المتجر من مراجعته.</p></div>
    <section class="contact-layout"><form class="contact-form" data-form="contact"><label>الاسم<input name="name" maxlength="120" required placeholder="اكتب اسمك"></label><label>البريد الإلكتروني<input name="email" type="email" maxlength="254" required placeholder="name@example.com"></label><label>رسالتك<textarea name="message" maxlength="5000" required rows="5" placeholder="كيف يمكننا مساعدتك؟"></textarea></label>${state.contactMessage ? `<div class="${state.contactError ? "api-error" : "success-box"}" role="${state.contactError ? "alert" : "status"}">${esc(state.contactMessage)}</div>` : ""}<button class="primary-btn" type="submit" ${state.contactLoading ? "disabled" : ""}>${state.contactLoading ? "جارٍ حفظ الرسالة..." : "حفظ الرسالة"} ${icon("arrowRight", 17)}</button></form></section>
    ${link("/", "العودة للرئيسية", "secondary-link-btn")}</main>`;
}

function adminPage() {
    if (!state.profile?.isAdmin) return '<main class="container page-shell"><div class="empty-state">هذه الصفحة متاحة للمديرين والموظفين المخولين فقط. <a href="auth.html">العودة للحساب</a></div></main>';
    const data = state.dashboardData;
    const stats = data?.stats;
    const statusNames = { pending: "قيد المراجعة", processing: "قيد التجهيز", shipped: "تم الشحن", completed: "مكتمل", cancelled: "ملغي" };
    if (state.dashboardLoading) return '<main class="container page-shell"><div class="empty-state">جارٍ تحميل بيانات لوحة الإدارة من قاعدة البيانات...</div></main>';
    if (state.dashboardError) return `<main class="container page-shell">${pageActions()}<div class="api-error" role="alert">${esc(state.dashboardError)}</div></main>`;
    if (!data) return '<main class="container page-shell"><div class="empty-state">لا توجد بيانات لعرضها. حدّث الصفحة وحاول مرة أخرى.</div></main>';
    return `<main class="container admin-page page-shell"><div class="admin-heading"><div><span class="eyebrow">إدارة المتجر</span><h1>لوحة الإدارة</h1><p>بيانات مباشرة من قاعدة بيانات MySQL.</p></div>${link("/", "العودة للمتجر", "secondary-btn admin-back")}</div>
    <section class="admin-stats">
      <article class="admin-stat"><div class="admin-stat-icon">${icon("orders", 20)}</div><span>إجمالي قيمة الطلبات المسجلة</span><strong>${money(stats.revenue)} ج.م</strong></article>
      <article class="admin-stat"><div class="admin-stat-icon">${icon("orders", 20)}</div><span>الطلبات</span><strong>${money(stats.orders)}</strong></article>
      <article class="admin-stat"><div class="admin-stat-icon">${icon("user", 20)}</div><span>العملاء</span><strong>${money(stats.customers)}</strong></article>
      <article class="admin-stat"><div class="admin-stat-icon">${icon("briefcase", 20)}</div><span>الموظفون والمديرون</span><strong>${money(stats.employees)}</strong></article>
      <article class="admin-stat"><div class="admin-stat-icon">${icon("bag", 20)}</div><span>المنتجات النشطة</span><strong>${money(stats.products)}</strong></article>
    </section>
    <section class="admin-grid">
      <article class="admin-panel admin-wide"><div class="admin-panel-heading"><div><span class="eyebrow">متابعة الطلبات</span><h2>الطلبات الأخيرة</h2><p>حدّث الحالة بعد تنفيذ الخطوة فعليًا.</p></div></div>${state.notice ? `<div class="${state.noticeError ? "api-error" : "success-box"}" role="${state.noticeError ? "alert" : "status"}">${esc(state.notice)}</div>` : ""}<div class="table-wrap"><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المستلم / الهاتف</th><th>عنوان التوصيل</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead><tbody>${data.recentOrders.map((order) => `<tr><td>#${esc(order.id)}</td><td>${esc(order.customerName)}<br><small>${esc(order.customerEmail)}</small></td><td>${esc(order.recipientName)}<br>${esc(order.phone)}</td><td>${esc(order.shippingAddress)}</td><td><select class="order-status-select" data-action="order-status" data-id="${esc(order.id)}" aria-label="حالة الطلب رقم ${esc(order.id)}">${Object.entries(statusNames).map(([value, label]) => `<option value="${value}"${order.status === value ? " selected" : ""}>${label}</option>`).join("")}</select></td><td>${money(order.total)} ج.م</td><td>${esc(order.createdAt)}</td></tr>`).join("") || "<tr><td colspan=\"7\">لا توجد طلبات في قاعدة البيانات.</td></tr>"}</tbody></table></div></article>
      <article class="admin-panel admin-wide"><div class="admin-panel-heading"><div><span class="eyebrow">إدارة الحسابات</span><h2>آخر 50 عميلًا وموظفًا</h2></div></div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>البريد الإلكتروني</th><th>نوع الحساب</th><th>تاريخ الإنشاء</th></tr></thead><tbody>${data.recentUsers.map((user) => `<tr><td>${esc(user.name)}</td><td>@${esc(user.username)}</td><td>${esc(user.email)}</td><td><span class="status-tag">${user.role === "customer" ? "عميل" : user.role === "admin" ? "مدير" : user.role === "manager" ? "مدير موظفين" : "موظف"}</span></td><td>${esc(user.createdAt)}</td></tr>`).join("") || "<tr><td colspan=\"5\">لا توجد حسابات في قاعدة البيانات.</td></tr>"}</tbody></table></div></article>
      <article class="admin-panel admin-wide"><div class="admin-panel-heading"><div><span class="eyebrow">المخزون</span><h2>المنتجات والأسعار</h2></div></div><div class="table-wrap"><table><thead><tr><th>رقم المنتج</th><th>اسم المنتج</th><th>التصنيف</th><th>السعر الحالي</th><th>الحالة</th></tr></thead><tbody>${data.products.map((product) => `<tr><td>${esc(product.id)}</td><td>${esc(product.name)}</td><td>${esc(product.category)}</td><td>${money(product.price)} ج.م</td><td><span class="status-tag">${Number(product.isActive) ? "نشط" : "متوقف"}</span></td></tr>`).join("") || "<tr><td colspan=\"5\">لا توجد منتجات في قاعدة البيانات.</td></tr>"}</tbody></table></div></article>
      <article class="admin-panel admin-wide"><div class="admin-panel-heading"><div><span class="eyebrow">رسائل العملاء</span><h2>آخر الرسائل المحفوظة</h2></div></div><div class="admin-list">${data.recentMessages.map((message) => `<article class="admin-list-row contact-message-row"><div><strong>${esc(message.name)} · ${esc(message.email)}</strong><span>${esc(message.createdAt)}</span><p>${esc(message.message)}</p></div></article>`).join("") || '<p class="empty-state">لا توجد رسائل محفوظة.</p>'}</div></article>
    </section></main>`;
}

function cartPanel() {
    if (!state.cartOpen) return "";
    const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    return `<aside class="cart-panel"><div class="cart-header"><b>سلة المشتريات</b><div class="cart-header-actions">${state.cart.length ? '<button type="button" class="cart-clear-button" data-action="clear-cart">مسح</button>' : ""}<button type="button" class="cart-close-button" data-action="close-cart" aria-label="إغلاق السلة">${icon("close")}</button></div></div>
    ${state.cart.length ? `${state.cart.map((item) => `<div class="cart-item"><span>${esc(item.name)}</span><div class="cart-item-controls"><button type="button" data-action="decrease-quantity" data-id="${item.id}" aria-label="تقليل كمية ${esc(item.name)}">−</button><b>${item.qty}</b><button type="button" data-action="increase-quantity" data-id="${item.id}" aria-label="زيادة كمية ${esc(item.name)}">+</button><button type="button" class="cart-remove-item" data-action="remove-cart-item" data-id="${item.id}" aria-label="إزالة ${esc(item.name)}">${icon("trash", 16)}</button><strong>${money(item.qty * item.price)} ج.م</strong></div></div>`).join("")}
      <div class="cart-total"><span>الإجمالي المسجل</span><b>${money(total)} ج.م</b></div>
      <form class="checkout-form" data-form="checkout"><label>اسم المستلم<input name="customerName" maxlength="120" required value="${esc(state.checkoutDraft.customerName || state.profile?.name || "")}"></label><label>رقم الهاتف<input name="phone" type="tel" inputmode="tel" pattern="[0-9()+ -]{8,30}" maxlength="30" required value="${esc(state.checkoutDraft.phone || "")}" placeholder="+20 1xxxxxxxxx"></label><label>عنوان التوصيل<textarea name="shippingAddress" maxlength="500" rows="3" required placeholder="المدينة، المنطقة، الشارع، رقم المبنى">${esc(state.checkoutDraft.shippingAddress || "")}</textarea></label>
      <p class="payment-note">يُسجّل الطلب في MySQL دون تحصيل إلكتروني. حالة الطلب تبقى قيد المراجعة حتى يؤكدها المتجر.</p>${state.checkoutMessage ? `<div class="checkout-message${state.checkoutError ? " is-error" : ""}" role="${state.checkoutError ? "alert" : "status"}">${esc(state.checkoutMessage)}${!state.profile ? ` ${link("/auth", "تسجيل الدخول")}` : ""}</div>` : ""}
      <button type="submit" class="primary-btn full-width" ${state.checkoutLoading ? "disabled" : ""}>${state.checkoutLoading ? "جارٍ تسجيل الطلب..." : "تسجيل الطلب"}</button></form>`
            : `${state.checkoutMessage ? `<div class="checkout-message">${esc(state.checkoutMessage)}</div>` : '<p class="cart-empty">السلة فارغة حاليًا. أضف بعض المنتجات لتبدأ التسوق.</p>'}`}
  </aside>`;
}

function favoriteToast() {
    if (!state.favoriteNotice) return "";
    return `<div class="favorite-toast" role="status" aria-live="polite">${icon("heart", 18, true)}<span>${esc(state.favoriteNotice)}</span></div>`;
}

function currentRoute() {
    const params = new URLSearchParams(location.search);
    const routes = {
        home: "/",
        offers: "/offers",
        product: `/product/${params.get("id") || ""}`,
        favorites: "/favorites",
        auth: "/auth",
        orders: "/orders",
        contact: "/contact",
        admin: "/admin",
    };
    return { path: routes[document.body.dataset.page] || "/", params };
}

function render() {
    const { path, params } = currentRoute();
    let content;
    if (path === "/") content = homePage();
    else if (path === "/offers") content = offersPage();
    else if (path === "/favorites") content = favoritesPage();
    else if (path === "/auth") content = authPage();
    else if (path === "/orders") content = ordersPage();
    else if (path === "/contact") content = contactPage();
    else if (path === "/admin") content = adminPage();
    else if (/^\/product\/\d+$/.test(path)) content = productPage(path.split("/").pop());
    else content = `<main class="container page-shell"><div class="empty-state not-found-box"><h2>الصفحة غير موجودة</h2><p>الرجاء العودة إلى الصفحة الرئيسية.</p>${link("/", "الرئيسية", "primary-btn")}</div></main>`;
    document.getElementById("site-header").innerHTML = header();
    document.getElementById("app").innerHTML = `${state.apiError ? `<div class="container api-error" role="alert">${esc(state.apiError)}</div>` : ""}${content}`;
    document.getElementById("site-footer").innerHTML = footer();
    document.getElementById("cart-root").innerHTML = `${favoriteToast()}${cartPanel()}`;
    if (params.get("section") === "products") requestAnimationFrame(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }));
}

function persist() {
    try {
        localStorage.setItem("qubix_cart", JSON.stringify(state.cart));
        localStorage.setItem("qubix_favorites", JSON.stringify(state.favorites));
        localStorage.removeItem("nexashop_demo_cart");
        localStorage.removeItem("online_store_favorites");
    } catch (error) {
        console.error("تعذر حفظ السلة والمفضلة:", error);
        state.apiError = "تعذر حفظ السلة والمفضلة على هذا الجهاز. تحقق من مساحة التخزين وإعدادات الخصوصية.";
    }
}

function addToCart(product) {
    const item = state.cart.find((entry) => entry.id === product.id);
    if (item && item.qty >= 99) {
        state.checkoutMessage = "الحد الأقصى لكل منتج هو 99 قطعة.";
        state.checkoutError = true;
    } else {
        if (item) item.qty += 1;
        else state.cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
        state.checkoutMessage = "";
        state.checkoutError = false;
    }
    state.cartOpen = true;
    persist();
}

function toggleFavorite(product) {
    const isFavorite = state.favorites.some((item) => Number(item.id) === product.id);
    if (isFavorite) {
        state.favorites = state.favorites.filter((item) => Number(item.id) !== product.id);
        state.favoriteNotice = "تم حذف المنتج من المفضلة";
    } else {
        state.favorites.push({ id: product.id });
        state.favoriteNotice = "تمت إضافة المنتج إلى المفضلة";
    }
    persist();
    window.clearTimeout(favoriteNoticeTimer);
    favoriteNoticeTimer = window.setTimeout(() => {
        state.favoriteNotice = "";
        render();
    }, 2400);
}

async function finishCheckout() {
    if (!state.cart.length) return;
    if (!state.profile) {
        state.checkoutMessage = "سجّل الدخول أولًا لحفظ الطلب في حسابك.";
        state.checkoutError = true;
        state.authDraft = {};
        return;
    }

    state.checkoutLoading = true;
    render();
    try {
        const result = await apiRequest("orders", {
            method: "POST",
            body: {
                items: state.cart.map((item) => ({ id: item.id, qty: item.qty })),
                customerName: state.checkoutDraft.customerName,
                phone: state.checkoutDraft.phone,
                shippingAddress: state.checkoutDraft.shippingAddress,
            },
        });
        state.orders.unshift(result.order);
        state.cart = [];
        state.checkoutDraft = { customerName: "", phone: "", shippingAddress: "" };
        state.checkoutMessage = result.message;
        state.checkoutError = false;
        persist();
    } catch (error) {
        state.checkoutMessage = error.message;
        state.checkoutError = true;
    } finally {
        state.checkoutLoading = false;
        render();
    }
}

document.addEventListener("click", async (event) => {
    const linkElement = event.target.closest("a[href^=\"#\"]");
    if (linkElement) {
        state.notice = "";
        state.cartOpen = false;
        return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const product = products.find((item) => item.id === Number(button.dataset.id));
    switch (button.dataset.action) {
        case "back":
            if (history.length > 1) history.back();
            else location.href = "index.html";
            return;
        case "open-cart": state.cartOpen = true; break;
        case "close-cart": state.cartOpen = false; break;
        case "clear-cart":
            state.cart = [];
            state.checkoutMessage = "";
            state.checkoutError = false;
            persist();
            break;
        case "increase-quantity":
            if (product) {
                const item = state.cart.find((entry) => entry.id === product.id);
                if (item && item.qty < 99) item.qty += 1;
                state.checkoutMessage = item?.qty === 99 ? "الحد الأقصى لكل منتج هو 99 قطعة." : "";
                state.checkoutError = false;
                persist();
            }
            break;
        case "decrease-quantity":
            if (product) {
                const item = state.cart.find((entry) => entry.id === product.id);
                if (item) item.qty -= 1;
                state.cart = state.cart.filter((entry) => entry.qty > 0);
                state.checkoutMessage = "";
                state.checkoutError = false;
                persist();
            }
            break;
        case "remove-cart-item":
            state.cart = state.cart.filter((entry) => entry.id !== Number(button.dataset.id));
            state.checkoutMessage = "";
            state.checkoutError = false;
            persist();
            break;
        case "mobile-menu": document.querySelector(".desktop-nav")?.classList.toggle("open"); return;
        case "category": state.category = button.dataset.category; break;
        case "favorite": if (product) toggleFavorite(product); break;
        case "add-cart": if (product) addToCart(product); break;
        case "auth-mode":
            state.authMode = button.dataset.mode;
            state.authDraft = {};
            state.notice = "";
            state.noticeError = false;
            break;
        case "edit-profile": document.getElementById("profile-editor")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
        case "logout":
            try {
                await apiRequest("auth/logout", { method: "POST", body: {} });
                let logoutNotice = "تم تسجيل الخروج.";
                if (state.profile) {
                    try {
                        localStorage.removeItem(`qubix_profile_photo_${state.profile.type}_${state.profile.id}`);
                        localStorage.removeItem(`nexashop_profile_photo_${state.profile.type}_${state.profile.id}`);
                    } catch (error) {
                        console.error("تعذر حذف الصورة الشخصية المحفوظة:", error);
                        logoutNotice = "تم تسجيل الخروج، لكن تعذر حذف الصورة المحفوظة على هذا الجهاز.";
                    }
                }
                state.profile = null;
                state.orders = [];
                state.dashboardData = null;
                state.notice = logoutNotice;
                state.noticeError = false;
            } catch (error) {
                state.notice = error.message;
                state.noticeError = true;
            }
            break;
        default: return;
    }
    render();
});

document.addEventListener("input", (event) => {
    if (event.target.id !== "product-search") return;
    const cursor = event.target.selectionStart;
    state.query = event.target.value;
    render();
    const input = document.getElementById("product-search");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
});

document.addEventListener("change", async (event) => {
    const select = event.target.closest('[data-action="order-status"]');
    if (!select) return;
    const previousStatus = select.dataset.previousStatus || select.querySelector("option[selected]")?.value;
    select.disabled = true;
    try {
        await apiRequest("admin/orders/status", {
            method: "PATCH",
            body: { orderId: Number(select.dataset.id), status: select.value },
        });
        state.notice = "تم تحديث حالة الطلب.";
        state.noticeError = false;
        await loadUserData();
    } catch (error) {
        state.notice = error.message;
        state.noticeError = true;
        if (previousStatus) select.value = previousStatus;
    } finally {
        select.disabled = false;
        render();
    }
});

document.addEventListener("change", (event) => {
    if (event.target.id === "profile-photo") {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
            state.notice = "اختر صورة صالحة لا يتجاوز حجمها 10 ميجابايت.";
            state.noticeError = true;
            render();
            return;
        }
        createImageBitmap(file).then((bitmap) => {
            const canvas = document.createElement("canvas");
            const size = 512;
            const cropSize = Math.min(bitmap.width, bitmap.height);
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("تعذر تجهيز الصورة على هذا المتصفح.");
            context.drawImage(bitmap, (bitmap.width - cropSize) / 2, (bitmap.height - cropSize) / 2, cropSize, cropSize, 0, 0, size, size);
            bitmap.close();
            const updatedProfile = { ...state.profile, photo: canvas.toDataURL("image/jpeg", 0.82) };
            localStorage.setItem(`qubix_profile_photo_${state.profile.type}_${state.profile.id}`, updatedProfile.photo);
            state.profile = updatedProfile;
            state.notice = "تم تحديث الصورة الشخصية وحفظها على هذا الجهاز.";
            state.noticeError = false;
            render();
        }).catch((error) => {
            console.error("تعذر حفظ الصورة الشخصية:", error);
            state.notice = "تعذر تحميل الصورة أو حفظها. جرّب صورة أخرى أصغر.";
            state.noticeError = true;
            render();
        });
        return;
    }
});

document.addEventListener("submit", async (event) => {
    const formType = event.target.dataset.form;
    if (!formType) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    if (formType === "search") {
        if (state.query.trim()) {
            location.href = `index.html?q=${encodeURIComponent(state.query.trim())}#products`;
        }
    } else if (formType === "checkout") {
        state.checkoutDraft = {
            customerName: values.customerName,
            phone: values.phone,
            shippingAddress: values.shippingAddress,
        };
        state.checkoutMessage = "";
        await finishCheckout();
    } else if (formType === "review") {
        state.reviewLoading = true;
        state.reviewMessage = "";
        render();
        try {
            const productId = Number(new URLSearchParams(location.search).get("id"));
            const result = await apiRequest("product/reviews", {
                method: "POST",
                body: {
                    productId,
                    rating: Number(values.rating),
                    review: values.review,
                },
            });
            const reviewsResult = await apiRequest("product/reviews", { query: { id: String(productId) } });
            const productData = await apiRequest("products");
            products = productData.products.map((item) => ({
                ...item,
                id: Number(item.id),
                price: Number(item.price),
                rating: Number(item.rating),
                reviewCount: Number(item.reviewCount),
            }));
            state.storeStats = productData.stats;
            state.productReviews = reviewsResult.reviews;
            state.canReviewProduct = reviewsResult.canReview;
            state.reviewMessage = result.message;
        } catch (error) {
            state.reviewMessage = error.message;
        } finally {
            state.reviewLoading = false;
        }
    } else if (formType === "contact") {
        state.contactLoading = true;
        state.contactMessage = "";
        state.contactError = false;
        render();
        try {
            const result = await apiRequest("contact", { method: "POST", body: values });
            state.contactMessage = result.message;
        } catch (error) {
            state.contactMessage = error.message;
            state.contactError = true;
        } finally {
            state.contactLoading = false;
        }
    } else if (formType === "profile") {
        try {
            const result = await apiRequest("profile", {
                method: "PUT",
                body: {
                    name: values.name,
                    email: values.email,
                    bio: values.bio,
                    city: values.city,
                    work: values.work,
                },
            });
            state.profile = { ...result.user, photo: state.profile.photo };
            state.notice = result.message;
            state.noticeError = false;
        } catch (error) {
            state.notice = error.message;
            state.noticeError = true;
        }
    } else if (formType === "auth") {
        state.authDraft = {
            username: values.username || "",
            identifier: values.identifier || "",
            name: values.name || "",
            email: values.email || "",
        };
        if (state.authMode === "register" && values.password !== values.password_confirmation) {
            state.notice = "كلمتا المرور غير متطابقتين.";
            state.noticeError = true;
            render();
            return;
        }
        state.authLoading = true;
        state.notice = "";
        state.noticeError = false;
        render();
        try {
            const route = state.authMode === "register" ? "auth/register" : "auth/login";
            const body = state.authMode === "register"
                ? { username: values.username, name: values.name, email: values.email, password: values.password }
                : { identifier: values.identifier, password: values.password };
            const result = await apiRequest(route, { method: "POST", body });
            state.profile = { ...result.user, photo: storedProfilePhoto(result.user) };
            state.authDraft = {};
            state.notice = result.message;
            state.noticeError = false;
            await loadUserData();
        } catch (error) {
            state.notice = error.message;
            state.noticeError = true;
        } finally {
            state.authLoading = false;
        }
    }
    render();
});

render();
loadApplicationData();
