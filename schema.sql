-- ============================================================
-- QR-Based Worker Review System v2
-- COMPLETE DATABASE SCHEMA
-- ============================================================
-- HOW TO RUN:
--   MySQL Workbench: File > Open SQL Script > select this file > ⚡ Execute
--   Terminal:        mysql -u root -p < schema.sql
--   Aiven console:   paste into the Query tab
-- ============================================================

DROP DATABASE IF EXISTS worker_review_db;
CREATE DATABASE worker_review_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE worker_review_db;

-- ============================================================
-- TABLE: admins
-- Supports MULTIPLE admins. Each has username + hashed password.
-- The "is_super" flag marks the original super-admin who cannot
-- be deleted by other admins.
-- ============================================================
CREATE TABLE admins (
  id            INT           NOT NULL AUTO_INCREMENT,
  username      VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  is_super      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username)
);

-- ============================================================
-- TABLE: stores
-- ============================================================
CREATE TABLE stores (
  id                  INT          NOT NULL AUTO_INCREMENT,
  store_name          VARCHAR(200) NOT NULL,
  store_address       TEXT,
  qr_slug             VARCHAR(100) NOT NULL,
  subscription_status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  qr_code_path        VARCHAR(255) DEFAULT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_stores_qr_slug (qr_slug),
  KEY idx_stores_status (subscription_status)
);

-- ============================================================
-- TABLE: store_users  (store owner login accounts)
-- ============================================================
CREATE TABLE store_users (
  id            INT          NOT NULL AUTO_INCREMENT,
  store_id      INT          NOT NULL,
  username      VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_store_users_username (username),
  KEY idx_store_users_store (store_id),

  CONSTRAINT fk_store_users_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- TABLE: workers
-- image_path stores either a Cloudinary https:// URL
-- OR a legacy local path like "uploads/abc.jpg"
-- ============================================================
CREATE TABLE workers (
  id          INT          NOT NULL AUTO_INCREMENT,
  store_id    INT          NOT NULL,
  worker_name VARCHAR(200) NOT NULL,
  role        VARCHAR(200) DEFAULT NULL,
  image_path  VARCHAR(500) DEFAULT NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_workers_store        (store_id),
  KEY idx_workers_status       (status),
  KEY idx_workers_store_status (store_id, status),

  CONSTRAINT fk_workers_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- TABLE: reviews  (anonymous customer reviews)
-- ============================================================
CREATE TABLE reviews (
  id          INT     NOT NULL AUTO_INCREMENT,
  store_id    INT     NOT NULL,
  worker_id   INT     NOT NULL,
  rating      TINYINT DEFAULT NULL,
  review_type ENUM('good','bad') NOT NULL,
  description TEXT    DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_reviews_store        (store_id),
  KEY idx_reviews_worker       (worker_id),
  KEY idx_reviews_type         (review_type),
  KEY idx_reviews_created      (created_at),
  KEY idx_reviews_store_type   (store_id, review_type),
  KEY idx_reviews_worker_type  (worker_id, review_type),

  CONSTRAINT chk_reviews_rating
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),

  CONSTRAINT fk_reviews_store
    FOREIGN KEY (store_id) REFERENCES stores(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_reviews_worker
    FOREIGN KEY (worker_id) REFERENCES workers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- VIEWS
-- ============================================================

CREATE VIEW v_store_summary AS
SELECT
  s.id                  AS store_id,
  s.store_name,
  s.store_address,
  s.qr_slug,
  s.subscription_status,
  s.created_at          AS store_created_at,
  su.username           AS owner_username,
  COUNT(DISTINCT w.id)  AS total_workers,
  COUNT(DISTINCT CASE WHEN w.status='active' THEN w.id END) AS active_workers,
  COUNT(DISTINCT r.id)  AS total_reviews,
    COUNT(DISTINCT r.id)  AS today_reviews where DATE(created_at)=CURDATE(),
  COUNT(DISTINCT CASE WHEN r.review_type='good' THEN r.id END) AS good_reviews,
  COUNT(DISTINCT CASE WHEN r.review_type='bad'  THEN r.id END) AS bad_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating
FROM stores s
LEFT JOIN store_users su ON su.store_id = s.id
LEFT JOIN workers     w  ON w.store_id  = s.id
LEFT JOIN reviews     r  ON r.store_id  = s.id
GROUP BY s.id, su.username;

CREATE VIEW v_worker_performance AS
SELECT
  w.id          AS worker_id,
  w.store_id,
  s.store_name,
  w.worker_name,
  w.role,
  w.image_path,
  w.status,
  COUNT(r.id)   AS total_reviews,
  SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END) AS good_reviews,
  SUM(CASE WHEN r.review_type='bad'  THEN 1 ELSE 0 END) AS bad_reviews,
  ROUND(AVG(r.rating),1) AS avg_rating,
  ROUND(
    100.0 * SUM(CASE WHEN r.review_type='good' THEN 1 ELSE 0 END)
    / NULLIF(COUNT(r.id),0), 1
  ) AS good_percent
FROM workers w
JOIN  stores  s ON s.id = w.store_id
LEFT JOIN reviews r ON r.worker_id = w.id
GROUP BY w.id, w.store_id, s.store_name, w.worker_name, w.role, w.image_path, w.status;

CREATE VIEW v_reviews_full AS
SELECT
  r.id, r.store_id, s.store_name,
  r.worker_id, w.worker_name, w.role AS worker_role, w.image_path AS worker_image,
  r.rating, r.review_type, r.description, r.created_at
FROM reviews r
JOIN workers w ON w.id = r.worker_id
JOIN stores  s ON s.id = r.store_id;

CREATE VIEW v_platform_stats AS
SELECT
  (SELECT COUNT(*) FROM stores)                                         AS total_stores,
  (SELECT COUNT(*) FROM stores WHERE subscription_status='active')     AS active_stores,
  (SELECT COUNT(*) FROM stores WHERE subscription_status='disabled')   AS disabled_stores,
  (SELECT COUNT(*) FROM workers WHERE status='active')                 AS active_workers,
  (SELECT COUNT(*) FROM reviews)                                        AS total_reviews,
  (SELECT COUNT(*) FROM reviews WHERE review_type='good')              AS good_reviews,
  (SELECT COUNT(*) FROM reviews WHERE review_type='bad')               AS bad_reviews,
  (SELECT ROUND(AVG(rating),1) FROM reviews WHERE rating IS NOT NULL)  AS avg_rating,
  (SELECT COUNT(*) FROM admins)                                         AS total_admins;

CREATE VIEW v_monthly_trend AS
SELECT
  store_id,
  DATE_FORMAT(created_at,'%Y-%m') AS month,
  COUNT(*) AS total_reviews,
  SUM(CASE WHEN review_type='good' THEN 1 ELSE 0 END) AS good_reviews,
  SUM(CASE WHEN review_type='bad'  THEN 1 ELSE 0 END) AS bad_reviews,
  ROUND(AVG(rating),1) AS avg_rating
FROM reviews
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
GROUP BY store_id, month
ORDER BY store_id, month;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Super admin account
-- Username: admin  |  Password: Admin@123
-- bcrypt hash of "Admin@123" with cost=10
INSERT INTO admins (username, password_hash, is_super) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1);

-- Two sample stores
INSERT INTO stores (store_name, store_address, qr_slug, subscription_status) VALUES
('Coffee Palace',  '12 Park Street, Chennai, TN 600001', 'coffee-palace-10001', 'active'),
('Tech Hub Store', '45 Anna Salai, Chennai, TN 600002',  'tech-hub-10002',      'active');

-- Store owner accounts
-- coffeepalace password: Store@123
-- techhub      password: Store@123
INSERT INTO store_users (store_id, username, password_hash) VALUES
(1, 'coffeepalace', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'),
(2, 'techhub',      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

-- Workers for Coffee Palace
INSERT INTO workers (store_id, worker_name, role, status) VALUES
(1, 'Arjun Kumar',  'Barista',       'active'),
(1, 'Priya Sharma', 'Cashier',       'active'),
(1, 'Ravi Menon',   'Floor Manager', 'active');

-- Workers for Tech Hub
INSERT INTO workers (store_id, worker_name, role, status) VALUES
(2, 'Vikram Singh', 'Sales Associate', 'active'),
(2, 'Anjali Das',   'Tech Support',    'active'),
(2, 'Karan Patel',  'Store Manager',   'active');

-- Sample reviews for Coffee Palace
INSERT INTO reviews (store_id, worker_id, rating, review_type, description, created_at) VALUES
(1,1,5,'good','Excellent service and coffee!',          NOW()-INTERVAL 1  DAY),
(1,1,5,'good','Best barista I have ever met.',          NOW()-INTERVAL 3  DAY),
(1,1,4,'good','Good overall.',                          NOW()-INTERVAL 5  DAY),
(1,1,2,'bad', 'Took too long during rush hour.',        NOW()-INTERVAL 7  DAY),
(1,2,5,'good','Very quick at billing. Always smiling.', NOW()-INTERVAL 2  DAY),
(1,2,1,'bad', 'Gave wrong change.',                     NOW()-INTERVAL 8  DAY),
(1,3,5,'good','Great manager. Resolved my issue fast.', NOW()-INTERVAL 4  DAY),
(1,3,2,'bad', 'Could be more attentive.',               NOW()-INTERVAL 14 DAY);

-- Sample reviews for Tech Hub
INSERT INTO reviews (store_id, worker_id, rating, review_type, description, created_at) VALUES
(2,4,5,'good','Very knowledgeable.',                    NOW()-INTERVAL 1 DAY),
(2,4,2,'bad', 'Was on phone during my query.',          NOW()-INTERVAL 5 DAY),
(2,5,5,'good','Fixed my laptop in minutes!',            NOW()-INTERVAL 2 DAY),
(2,5,5,'good','Best tech support ever.',                NOW()-INTERVAL 4 DAY),
(2,6,4,'good','Well-managed store.',                    NOW()-INTERVAL 3 DAY),
(2,6,1,'bad', 'Manager was rude about refund.',         NOW()-INTERVAL 8 DAY);

-- ============================================================
-- VERIFY
-- ============================================================
SHOW TABLES;

SELECT 'admins'      AS tbl, COUNT(*) AS rows FROM admins
UNION ALL SELECT 'stores',      COUNT(*) FROM stores
UNION ALL SELECT 'store_users', COUNT(*) FROM store_users
UNION ALL SELECT 'workers',     COUNT(*) FROM workers
UNION ALL SELECT 'reviews',     COUNT(*) FROM reviews;

SELECT * FROM v_platform_stats;
