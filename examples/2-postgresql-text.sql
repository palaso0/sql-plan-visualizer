SELECT o.*, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '90 days'
  AND c.account_state = 'active'
ORDER BY o.created_at DESC;
