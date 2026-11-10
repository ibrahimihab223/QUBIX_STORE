USE nexashop;

-- Run only when migrating data from the earlier customers/employees schema.
INSERT INTO users
    (username, full_name, email, password_hash, role, is_active, bio, city, job_title, created_at)
SELECT username, full_name, email, password_hash, 'customer', 1, bio, city, work, created_at
FROM customers;

INSERT INTO users
    (username, full_name, email, password_hash, role, is_active, bio, city, job_title, created_at)
SELECT username, full_name, email, password_hash, role, is_active, bio, city, job_title, created_at
FROM employees;
