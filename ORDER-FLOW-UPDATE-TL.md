# Update: Network → Promo → Place Order

Ang retailer order page ay inayos para sa mobile-friendly, sunod-sunod na pagpili:
1. Piliin muna ang network card.
2. Lalabas ang promo cards para sa network na iyon, gamit ang catalog price at description.
3. Kapag pinili ang promo, saka lalabas ang customer/mobile details at Place Order form.

Pinanatili ang original public site files, promo catalog, logos, payment QR assets, API/server code, at environment-variable setup mula sa source ZIP. Ang retailer order UI ay nasa `retailer.html`, `retailer.js`, at `retailer.css`.

Hindi ito awtomatikong nagde-deploy sa GitHub Pages o Render. I-test muna sa staging/test retailer account bago tumanggap ng totoong top-ups o orders.
