# Gabay sa Manual Seasonal Theme — Ronald E-Loading Retailer

Hindi kailangang galawin ang Admin Panel o database para magpalit ng theme. Manual lang ang pagpili.

## Paano magpalit ng theme

1. Buksan ang `retailer.html`.
2. Hanapin ang opening body tag:

   `<body data-season="christmas">`

3. Palitan ang `christmas` ng isa sa mga value sa ibaba.
4. I-save at i-deploy ang updated files sa Render.

| Season | Value ng data-season |
|---|---|
| Valentine's Day | `valentines` |
| Summer Day | `summer` |
| Summer / April Holy Week | `holyweek` |
| Summer / Fiesta | `fiesta` |
| Independence Day / Rainy Season | `rainy` |
| Midyear Sale / Discount | `midyear` |
| Buwan ng Wika | `buwanwika` |
| Christmas Season | `christmas` |
| Halloween Season | `halloween` |
| New Year Season | `newyear` |

## Mga file na binago / nadagdag

- `retailer.html` — may `data-season` selector sa `<body>` at naglo-load ng seasonal script.
- `retailer.css` — may 10 color palettes at seasonal styling para sa banner, hero, message, countdown at decorative effects.
- `retailer.js` — countdown target na angkop sa napiling season; nananatili ang dating countdown location at IDs.
- `retailer-season.js` — bagong file para sa seasonal banner text, headings, messages, decorative elements at countdown labels.

**Paalala:** Ang theme ay manual pa ring pinipili sa `retailer.html`, hindi sa Admin Panel. Ang network logos/cards at order functionality ay hindi binago. Ang countdown date ay fixed annual month/day approximation para sa bawat theme; hindi ito awtomatikong nag-a-adjust sa movable dates gaya ng Holy Week.
