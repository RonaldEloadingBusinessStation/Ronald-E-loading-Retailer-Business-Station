# Monthly Seasonal Theme Update

This update adds automatic monthly seasonal themes to the retailer portal. The theme is selected from the Philippines local browser date. Network cards and promo cards are explicitly excluded from the seasonal styling layer. The existing countdown location and element IDs are preserved; the countdown now points to the start of the next month.

Files changed from the supplied original ZIP:
- `retailer.html` — replaces the Christmas-only hero/banner/message with reusable seasonal content and applies the month theme.
- `retailer.css` — adds professional, high-contrast theme palettes and responsive styling while preserving network and promo card styles.
- `retailer.js` — updates the existing countdown to the next monthly theme boundary.

Theme calendar:
- January: New Year
- February: Valentine's Day
- March: Summer Day
- April: Summer / Holy Week
- May: Summer / Fiesta
- June: Independence Day / Rainy Season
- July: Midyear Sale / Discount
- August: Buwan ng Wika
- September: Christmas Season
- October: Halloween Season
- November: Christmas Season
- December: Christmas Season

No Admin Panel or database settings are added. Monthly selection is automatic based on the current month.
