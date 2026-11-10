<?php
declare(strict_types=1);

return [
    'host' => getenv('QUBIX_DB_HOST') ?: (getenv('NEXASHOP_DB_HOST') ?: '127.0.0.1'),
    'database' => getenv('QUBIX_DB_NAME') ?: (getenv('NEXASHOP_DB_NAME') ?: 'nexashop'),
    'username' => getenv('QUBIX_DB_USER') ?: (getenv('NEXASHOP_DB_USER') ?: 'root'),
    'password' => getenv('QUBIX_DB_PASSWORD') ?: (getenv('NEXASHOP_DB_PASSWORD') ?: ''),
];
