SELECT o.*, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
ORDER BY o.created_at;
