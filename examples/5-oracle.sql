SELECT c.name, o.id, o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.status = 'ACTIVE'
  AND o.created_at >= SYSDATE - 90
ORDER BY c.name;
