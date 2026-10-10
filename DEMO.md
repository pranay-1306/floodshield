# FloodShield demo script

Use this for a 2–3 minute recording. Start both processes first: `npm run api` then `npm run dev`. Record at a mobile width (~390px) or desktop; Assign/Start/Resolve stays visible on phones.

## Story

A DTU student is heading to Mandi House. FloodShield should warn about the underpass on *that* corridor, not every hotspot in Delhi. A west-Delhi trip should stay calmer even if Mandi House is flooded. A citizen report should move the authority queue, then the commuter score.

## Beats

1. **Home (15s)**  
   Point to Open-Meteo source and time on the weather card. Say: *rain + reports + hotspots on your actual journey.*

2. **Clear corridor (30s)**  
   Plan a route → **Dwarka Sector 21** to **Vasant Kunj** → Check route.  
   Show *no Mandi House on corridor*, lower score, forecast source/time, confidence label.

3. **Exposed corridor (30s)**  
   Change to **DTU, Rohini** → **Mandi House**.  
   Show Mandi House Underpass in “why this route is risky”, distance in km, recommendation.

4. **Citizen report (30s)**  
   **Report this road**. Location prefilled. Detail at least 12 characters, severity Severe. Submit.  
   Duplicate-submit the same text to show the 20-minute rejection if you have extra time.

5. **Authority (30s)**  
   Authority view: Mandi House report count/risk up. **Assign → Start → Resolve**.  
   Return to the same commuter route and show the score drop.

6. **Honest close (15s)**  
   *Illustrative map, 3 km geodesic corridor, not official warnings. AWS path is API Gateway + Lambda + DynamoDB after this loop is solid.*

## What not to claim

- Turn-by-turn safe routing  
- Live road-closure verification  
- SMS / push alerts (the dashboard labels this as demo)  
- A city-wide GIS model
