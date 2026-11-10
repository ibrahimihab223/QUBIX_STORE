USE nexashop;

ALTER TABLE orders
    MODIFY payment_method ENUM('none', 'card', 'fawry', 'wallet') NOT NULL DEFAULT 'none',
    ADD COLUMN customer_name VARCHAR(120) NOT NULL DEFAULT '' AFTER payment_method,
    ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT '' AFTER customer_name,
    ADD COLUMN shipping_address VARCHAR(500) NOT NULL DEFAULT '' AFTER phone;

CREATE TABLE IF NOT EXISTS product_reviews (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id INT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    review_text VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_reviews_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_product_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uq_product_reviews_user_product (user_id, product_id),
    KEY idx_product_reviews_product_created (product_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
