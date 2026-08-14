SELECT p.product_name, c.customer_name, SUM(f.amount)
FROM fact_sales f
JOIN dim_customer c ON c.id = f.customer_id
JOIN dim_product p ON p.id = f.product_id
WHERE f.sale_date >= DATE '2024-01-01'
GROUP BY p.product_name, c.customer_name
ORDER BY SUM(f.amount) DESC;
