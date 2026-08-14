SELECT c.name, o.id, o.created_at
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.status = 'active'
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days';
