# Referral System — RONALD E-LOADING BUSINESS STATION

## Mga feature
- Bawat retailer ay may sariling referral code at invite link.
- Kapag nag-register gamit ang referral link, naka-link ang bagong account sa nag-invite.
- Reward ay ibinibigay lamang kapag ang eligible order ay minarkahang `COMPLETED`.
- Rates: 5% para sa GLOBE, TM, GOMO, GFIBER, at GLOBE AT HOME; 1% para sa SMART, TNT, DITO, PLDT, at CIGNAL.
- Ang referral reward ay idinadagdag sa wallet ng nag-invite at inililista sa wallet ledger at referral history.
- May unique order constraint upang hindi ma-credit nang dalawang beses ang parehong order.
- Ang existing retailer accounts ay bibigyan ng referral code sa unang database initialization.

## Files na binago / idinagdag
- `server.js` — database migration, referral registration, referral details API, at reward credit kapag completed ang order mula sa admin website o Telegram admin flow.
- `retailer.html` — referral card, rates, invite link, history, at hidden referral code field.
- `retailer.css` — referral card styling.
- `retailer.js` — referral link loading, copy button, history display, at pagkuha ng code mula sa `?ref=` invite URL.
- `REFERRAL-SYSTEM-NOTES-TL.md` — notes para sa owner.

## Deployment
1. I-upload ang mga binagong file sa kasalukuyang GitHub repository. Panatilihin ang existing `DATABASE_URL` at iba pang Render environment variables.
2. I-deploy ang latest commit sa Render.
3. Mag-login sa retailer account, hanapin ang **Referral Rewards**, at kopyahin ang invite link.
4. Subukan gamit ang bagong test retailer account at isang eligible order. Reward ay dapat lumabas lang pagkatapos markahang `COMPLETED` ang order.

## Paalala
Ang reward ay porsiyento ng order amount na naitala sa retailer portal. Hindi nito awtomatikong nilo-load ang SIM/customer; ang existing manual completion workflow ay nananatili. I-test muna sa maliit na eligible order pagkatapos mag-deploy.
