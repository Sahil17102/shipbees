const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const USER_PANEL_LOGIN = 'https://shipbees-client.onrender.com/login';

const nav = () => `
<header class="nav" id="siteNav"><div class="shell nav-inner">
  <a class="brand logo-link" href="/" aria-label="ShipBees home"><img class="brand-logo" src="/assets/shipbees-logo.svg" alt="ShipBees — People, Parcels, Progress"></a>
  <nav class="nav-links" aria-label="Main navigation">
    <div class="nav-drop"><button type="button" class="solutions-toggle" aria-expanded="false">Solutions⌄</button><div class="mega">
      <a href="/rate-calculator"><i>₹</i><span><strong>Rate finder</strong><small>Plan a shipment budget</small></span></a>
      <a href="/tracking"><i>⌖</i><span><strong>Parcel tracking</strong><small>Follow a delivery live</small></span></a>
      <a href="/weight-calculator"><i>◫</i><span><strong>Weight checker</strong><small>Find billable weight</small></span></a>
      <a href="/integrations"><i>⌘</i><span><strong>Connected commerce</strong><small>Unify stores and carriers</small></span></a>
    </div></div>
    <a href="/platform">Platform</a><a href="/pricing">Pricing</a><a href="/carriers">Carriers</a><a href="/learn">Learn</a>
  </nav>
  <div class="nav-actions"><a class="btn btn-light" href="${USER_PANEL_LOGIN}">Log in</a><a class="btn btn-primary" href="/rate-calculator">Get a quote <span>→</span></a></div>
  <button class="menu-btn" type="button" aria-label="Open menu">☰</button>
</div></header>`;

const footer = () => `
<section class="section"><div class="shell quote"><div><span class="eyebrow" style="color:#ffbf3f">READY TO MOVE?</span><h2>Make your next dispatch feel effortless.</h2><p>Check the billable weight, plan a rate, and keep the journey visible.</p></div><a class="btn btn-primary" href="/rate-calculator">Plan a shipment →</a></div></section>
<footer class="footer"><div class="shell footer-grid">
  <div><a class="brand logo-link footer-logo-link" href="/" aria-label="ShipBees home"><img class="brand-logo footer-logo" src="/assets/shipbees-logo.svg" alt="ShipBees — People, Parcels, Progress"></a><p>A practical delivery workspace for ambitious online sellers—from packed box to happy doorstep.</p></div>
  <div><h4>Plan</h4><a href="/weight-calculator">Weight checker</a><a href="/rate-calculator">Rate finder</a></div>
  <div><h4>Connect</h4><a href="/integrations/sales-channels">Sales channels</a><a href="/integrations/courier-partners">Delivery network</a></div>
  <div><h4>Explore</h4><a href="/tracking">Track parcel</a><a href="/blogs">Guides</a><a href="${USER_PANEL_LOGIN}">Merchant login</a></div>
</div><div class="shell footer-bottom"><span>© 2026 ShipBees Commerce Technologies</span><span>Privacy · Terms · Responsible shipping</span></div></footer>`;

const pageArt = () => `<div class="page-art" aria-hidden="true"><div class="mini-box"><small>Orders synced</small><strong>Ready to dispatch</strong></div><div class="mini-box"><small>Network status</small><strong style="color:#0f9d91">● All routes active</strong></div></div>`;
const pageHero = (eyebrow,title,copy,actions=true) => `<section class="page-hero"><div class="shell page-hero-grid"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p>${actions?`<div class="hero-actions"><a class="btn btn-primary" href="/rate-calculator">Check a delivery rate →</a><a class="btn btn-light" href="/tracking">Follow a parcel</a></div>`:""}</div>${pageArt()}</div></section>`;
const featureSection = (label,title,cards) => `<section class="section"><div class="shell"><div class="center-head"><span class="eyebrow">${label}</span><h2>${title}</h2></div><div class="feature-grid">${cards.map((c,i)=>`<article class="feature-card"><div class="icon-box">${c[0]}</div><h3>${c[1]}</h3><p>${c[2]}</p>${c[3]?`<a class="text-link" href="${c[3]}">Explore <span>→</span></a>`:""}</article>`).join('')}</div></div></section>`;

const stackSection = () => `<section class="stack-section"><div class="shell"><div class="stack-intro"><span class="eyebrow">ONE PLATFORM · FOUR POSSIBILITIES</span><h2>Watch your shipping workflow<br>come together.</h2><p>Scroll through four connected capabilities built to keep orders moving and decisions clear.</p></div></div><div class="shell stack-wrap">
  <article class="stack-card stack-blue" style="--stack-index:0"><div class="stack-copy"><span class="stack-kicker">1/4 · DOMESTIC</span><div class="stack-icon">🚚</div><h3>One flow for every<br>Indian delivery.</h3><p>Prepare, compare and follow domestic parcels without jumping between disconnected courier screens.</p><a href="/rate-calculator">Plan a route →</a></div><div class="stack-visual"><div class="stack-metric"><strong>28K+</strong><span>delivery pin codes</span></div><div class="mini-dashboard"><div class="mini-dash-head"><strong>Today’s orders</strong><small>View all</small></div><div class="mini-order"><i>□</i><span><b>#SB4827</b><small>Jaipur → Pune</small></span><em>Pickup ready</em></div><div class="mini-order"><i>□</i><span><b>#SB4826</b><small>Surat → Kochi</small></span><em>In transit</em></div><div class="mini-order"><i>□</i><span><b>#SB4825</b><small>Delhi → Indore</small></span><em>Delivered</em></div></div></div></article>
  <article class="stack-card stack-green" style="--stack-index:1"><div class="stack-copy"><span class="stack-kicker">2/4 · CROSS-BORDER</span><div class="stack-icon">✈</div><h3>Go beyond borders<br>with a clear plan.</h3><p>Keep documentation, route choices and international milestones organised from the first export order onward.</p><a href="/integrations/courier-partners">Explore global reach →</a></div><div class="stack-visual globe-visual"><div class="stack-metric"><strong>220+</strong><span>global destinations</span></div><div class="globe"><span>✈</span><i></i><i></i><i></i></div><div class="route-cities"><b>Mumbai</b><span>••••••••</span><b>London</b></div></div></article>
  <article class="stack-card stack-gold" style="--stack-index:2"><div class="stack-copy"><span class="stack-kicker">3/4 · INTELLIGENCE</span><div class="stack-icon">⌁</div><h3>Let route signals guide<br>the next decision.</h3><p>Compare useful cost, speed and service signals before booking, then keep exceptions visible while parcels move.</p><a href="/rate-calculator">Compare a shipment →</a></div><div class="stack-visual"><div class="stack-metric"><strong>Live</strong><span>route comparison</span></div><div class="signal-panel"><div class="signal-head"><span>Courier fit</span><b>Updated now</b></div><div class="signal-score"><strong>92</strong><span>Best route match</span></div><div class="signal-bars"><i style="--bar:88%"></i><i style="--bar:64%"></i><i style="--bar:46%"></i><i style="--bar:72%"></i><i style="--bar:95%"></i></div><small>Speed · reach · cost balance</small></div></div></article>
  <article class="stack-card stack-violet" style="--stack-index:3"><div class="stack-copy"><span class="stack-kicker">4/4 · SCALE</span><div class="stack-icon">↗</div><h3>A shipping setup that<br>grows with the team.</h3><p>Connect more stores, locations and delivery services while keeping one consistent operating rhythm.</p><a href="/integrations">See the platform →</a></div><div class="stack-visual"><div class="stack-metric"><strong>85+</strong><span>carrier services</span></div><div class="scale-panel"><div class="orbit orbit-a"><span>Store</span></div><div class="orbit orbit-b"><span>Orders</span></div><div class="orbit orbit-c"><span>Carriers</span></div><div class="scale-core">SHIP<br>BEES</div></div></div></article>
</div></section>`;

const reviewWall = () => {
  const ticker = `<span><i>OD</i> “Orders feel organised before pickup begins.”</span><span><i>RT</i> “The whole route reads like one clear story.”</span><span><i>CS</i> “Support can answer without switching tabs.”</span><span><i>WH</i> “Every packed box keeps its next action.”</span>`;
  return `<section class="review-wall" id="reviewWall">
    <div class="shell review-heading"><span class="eyebrow">ILLUSTRATIVE REVIEW PREVIEW</span><h2>What a clearer shipping day<br>could sound like.</h2><p>Sample review layouts for presentation only. Replace these with verified customer words whenever real testimonials are available.</p></div>
    <div class="shell review-layout">
      <article class="review-feature review-reveal">
        <span class="review-stars" aria-label="Five star illustrative rating">★★★★★</span>
        <blockquote>“Our dispatch view finally feels calm. The team can see what is packed, what has moved, and which shipment needs attention without chasing separate courier screens.”</blockquote>
        <div class="review-feature-panel"><small>WORKFLOW MOMENTS</small><div><strong>One queue</strong><span>for daily dispatch</span></div><div><strong>One timeline</strong><span>for parcel visibility</span></div></div>
        <div class="review-person"><span>AS</span><div><strong>Ananya Shah</strong><small>Illustrative reviewer · D2C operations</small></div></div>
      </article>
      <div class="review-grid">
        <article class="review-card review-reveal" style="--review-delay:80ms"><span class="review-stars">★★★★★</span><p>“Rate, weight and service choices now sit together, so the booking decision feels much easier to explain.”</p><em>RATE PLANNING</em><div class="review-person"><span>AM</span><div><strong>Aarav Mehta</strong><small>Illustrative reviewer · Fulfilment planner</small></div></div></article>
        <article class="review-card review-reveal" style="--review-delay:150ms"><span class="review-stars">★★★★★</span><p>“A readable shipment timeline gives our support desk the context to respond with confidence.”</p><em>LIVE TRACKING</em><div class="review-person"><span>NK</span><div><strong>Nisha Kapoor</strong><small>Illustrative reviewer · Customer support</small></div></div></article>
        <article class="review-card review-reveal" style="--review-delay:220ms"><span class="review-stars">★★★★★</span><p>“Pickup-ready orders stay visible through the busiest hour, without the usual tab switching.”</p><em>DISPATCH FLOW</em><div class="review-person"><span>RV</span><div><strong>Rohan Verma</strong><small>Illustrative reviewer · Warehouse lead</small></div></div></article>
        <article class="review-card review-reveal" style="--review-delay:290ms"><span class="review-stars">★★★★★</span><p>“More stores and delivery partners can join the workflow while the day still feels familiar.”</p><em>CONNECTED COMMERCE</em><div class="review-person"><span>MI</span><div><strong>Meera Iyer</strong><small>Illustrative reviewer · Operations manager</small></div></div></article>
      </div>
    </div>
    <div class="review-marquee review-marquee-bottom" aria-hidden="true"><div class="review-track">${ticker}${ticker}</div></div>
  </section>`;
};

const workflowFan = () => `<section class="story-section"><div class="shell story-heading"><span class="eyebrow">THE FEELING OF A CLEARER WORKDAY</span><h2>Shipping stories,<br>in motion.</h2><p>Scroll to organise the five workflow cards, move your pointer across them, or drag the fan.</p></div><div class="story-fan" id="storyFan" aria-label="Interactive shipping workflow stories">
  <article class="story-card story-lilac" style="--delay:0ms" data-depth="0.45" data-fx="-305" data-fy="52" data-fr="-10" data-gx="-390" data-gy="20"><span class="story-quotes">“</span><p>Orders from every storefront land in one calm queue, ready for the team to pack and hand over.</p><div class="story-rule"></div><strong>ORDER DESK</strong><small>Illustrative workflow</small></article>
  <article class="story-card story-mint" style="--delay:70ms" data-depth="0.72" data-fx="-142" data-fy="-18" data-fr="-2" data-gx="0" data-gy="20"><span class="story-quotes">“</span><p>Route, weight and service choices become visible before booking, so the next decision feels considered.</p><div class="story-rule"></div><strong>RATE PLANNING</strong><small>Illustrative workflow</small></article>
  <article class="story-card story-lilac" style="--delay:140ms" data-depth="0.58" data-fx="125" data-fy="42" data-fr="9" data-gx="390" data-gy="20"><span class="story-quotes">“</span><p>A readable milestone timeline gives support teams context without chasing several courier portals.</p><div class="story-rule"></div><strong>SUPPORT VIEW</strong><small>Illustrative workflow</small></article>
  <article class="story-card story-mint" style="--delay:210ms" data-depth="0.95" data-fx="-210" data-fy="245" data-fr="-18" data-gx="-195" data-gy="470"><span class="story-quotes">“</span><p>Packed boxes, labels and pickup-ready orders stay together through the busiest part of dispatch.</p><div class="story-rule"></div><strong>WAREHOUSE FLOW</strong><small>Illustrative workflow</small></article>
  <article class="story-card story-mint" style="--delay:280ms" data-depth="1.05" data-fx="105" data-fy="232" data-fr="18" data-gx="195" data-gy="470"><span class="story-quotes">“</span><p>As volume grows, the operating rhythm stays familiar even when more stores and carriers join.</p><div class="story-rule"></div><strong>SCALE MODE</strong><small>Illustrative workflow</small></article>
  <div class="story-cursor" aria-hidden="true">DRAG</div>
</div><div class="story-hint">Move cursor · Drag cards · Scroll to organise</div></section>`;

const networkStage = () => `<section class="network-stage" id="networkStage">
  <div class="network-grid" aria-hidden="true"></div>
  <div class="shell network-layout">
    <div class="network-copy reveal-item">
      <span class="network-kicker"><i></i> THE SHIPBEES CONTROL LANE</span>
      <h2>Every handoff.<br><span>One moving picture.</span></h2>
      <p>See the route take shape from pickup to doorstep. ShipBees keeps each milestone in one clear view, so your team knows what moved, what is next, and where attention is needed.</p>
      <div class="network-actions"><a class="btn btn-primary" href="/tracking">Explore live tracking <span>→</span></a><a class="network-link" href="/integrations">See connected commerce <span>↗</span></a></div>
      <div class="network-points" aria-label="Workflow benefits"><span><i>✓</i> One shipment timeline</span><span><i>✓</i> Clear exception signals</span><span><i>✓</i> Customer-ready updates</span></div>
    </div>
    <div class="route-console reveal-item" id="routeConsole" aria-label="Illustrative live parcel route from Jaipur to Bengaluru">
      <div class="console-top"><span><i></i> LIVE MOVEMENT</span><b>SB-4827</b></div>
      <div class="route-map">
        <img class="route-photo" src="/assets/network-hub-night.png" alt="Orange cargo truck moving through an illuminated logistics hub at blue hour">
        <div class="route-photo-shade" aria-hidden="true"></div>
        <div class="map-orbit orbit-route-a"></div><div class="map-orbit orbit-route-b"></div>
        <div class="city city-origin"><i></i><small>PICKED UP</small><strong>Jaipur</strong></div>
        <div class="city city-hub"><i></i><small>SORTED</small><strong>Nagpur hub</strong></div>
        <div class="city city-destination"><i></i><small>NEXT STOP</small><strong>Bengaluru</strong></div>
        <svg class="route-line" viewBox="0 0 760 330" preserveAspectRatio="none" aria-hidden="true"><path class="route-shadow" d="M95 236 C230 80 420 285 664 104"/><path class="route-active" d="M95 236 C230 80 420 285 664 104"/></svg>
        <div class="moving-parcel" aria-hidden="true"><span>◆</span></div>
        <div class="route-status status-main"><small>CURRENT STATUS</small><strong>Line-haul in motion</strong><span><i></i> Updated just now</span></div>
        <div class="route-status status-eta"><small>ESTIMATED ARRIVAL</small><strong>Tomorrow · 08:30</strong></div>
      </div>
      <div class="console-stats"><div><strong>03</strong><span>handoffs visible</span></div><div><strong>1,742 km</strong><span>route in view</span></div><div><strong>On time</strong><span>movement signal</span></div></div>
    </div>
  </div>
</section>`;

const home = () => `${nav()}<main>
<section class="hero"><div class="shell hero-grid"><div><span class="eyebrow">Built for growing online brands</span><h1>Every parcel.<br><span>Perfectly in motion.</span></h1><p>Bring orders, courier choices, dispatch and customer updates into one calm shipping workspace.</p><div class="hero-actions"><a class="btn btn-primary" href="/rate-calculator">Find my shipping rate →</a><a class="btn btn-light" href="/tracking">⌖ Track a parcel</a></div><div class="trust-note"><b>✓</b> Start free · Scale at your own pace</div></div>
<div class="hero-visual hero-carousel" id="heroCarousel" aria-label="ShipBees logistics platform scenes">
  <div class="hero-stage">
    <article class="hero-slide active" data-scene="Dispatch control" aria-hidden="false"><img src="/assets/hero-dispatch-3d.png" alt="3D dispatch hub with parcels, route pins and a delivery van"><div class="scene-chip scene-chip-top"><small>Dispatch queue</small><strong>84 ready <span>+12%</span></strong></div><div class="scene-chip scene-chip-bottom"><small>Handover status</small><strong>Pickup ready</strong></div></article>
    <article class="hero-slide" data-scene="Global routes" aria-hidden="true"><img src="/assets/hero-global-3d.png" alt="3D global logistics network with airplane, cargo ship and route pins"><div class="scene-chip scene-chip-top"><small>Route canvas</small><strong>Global planning</strong></div><div class="scene-chip scene-chip-bottom"><small>Network mode</small><strong>Air + surface</strong></div></article>
    <article class="hero-slide" data-scene="Smart routing" aria-hidden="true"><img src="/assets/hero-routing-3d.png" alt="3D smart route network with live paths and analytics"><div class="scene-chip scene-chip-top"><small>Route signals</small><strong>Live comparison</strong></div><div class="scene-chip scene-chip-bottom"><small>Decision view</small><strong>Best fit found</strong></div></article>
    <article class="hero-slide" data-scene="Fulfilment flow" aria-hidden="true"><img src="/assets/hero-warehouse-3d.png" alt="3D automated warehouse with conveyors and packed parcels"><div class="scene-chip scene-chip-top"><small>Fulfilment flow</small><strong>Orders moving</strong></div><div class="scene-chip scene-chip-bottom"><small>Warehouse status</small><strong>Ready to load</strong></div></article>
    <div class="hero-glow" aria-hidden="true"></div><div class="hero-ring ring-one" aria-hidden="true"></div><div class="hero-ring ring-two" aria-hidden="true"></div>
  </div>
  <div class="hero-carousel-controls"><button class="hero-arrow" id="heroPrev" type="button" aria-label="Previous scene">←</button><div class="hero-progress" role="tablist" aria-label="Choose a hero scene"><button class="active" type="button" data-hero-slide="0" role="tab" aria-selected="true" aria-label="Dispatch control"></button><button type="button" data-hero-slide="1" role="tab" aria-selected="false" aria-label="Global routes"></button><button type="button" data-hero-slide="2" role="tab" aria-selected="false" aria-label="Smart routing"></button><button type="button" data-hero-slide="3" role="tab" aria-selected="false" aria-label="Fulfilment flow"></button></div><button class="hero-arrow" id="heroNext" type="button" aria-label="Next scene">→</button></div>
  <div class="hero-scene-label"><span id="heroSceneNumber">01</span><strong id="heroSceneTitle">Dispatch control</strong></div>
</div></div></section>
<section class="logo-strip"><div class="shell logo-line"><small>MADE FOR THE WAY INDIA SELLS</small><span>Shopify</span><span>WooCommerce</span><span>Amazon</span><span>Flipkart</span><span>Custom Store</span></div></section>
${stackSection()}
${featureSection('ONE SHIPPING DESK','Less juggling. More delivering.',[['⌘','One dispatch queue','Pull orders into a single, tidy workflow and prepare every parcel with fewer repeated steps.','/integrations/sales-channels'],['⇄','A flexible carrier mix','Match cost, route and urgency across multiple delivery partners—without getting boxed in.','/integrations/courier-partners'],['◎','Updates people understand','Give customers a clean delivery timeline while your team spots exceptions early.','/tracking']])}
${workflowFan()}
${networkStage()}
<section class="section tool-showcase"><div class="shell"><div class="center-head"><span class="eyebrow">SEE IT IN ACTION</span><h2>A clearer day for your shipping team.</h2><p>Switch between the key moments in a daily delivery workflow.</p></div><div class="tool-tabs"><button class="tool-tab active" data-tool="book">Book</button><button class="tool-tab" data-tool="watch">Track</button><button class="tool-tab" data-tool="learn">Improve</button></div><div class="tool-panel"><div class="tool-copy"><span class="eyebrow" id="toolLabel">SMART DISPATCH</span><h3 id="toolTitle">Move packed orders without the busywork.</h3><p id="toolCopy">Review shipment details, compare a sensible service, and keep the handoff organised from the same workspace.</p><a class="btn btn-dark" id="toolLink" href="/rate-calculator">Estimate a route →</a></div><div class="dashboard"><div class="dash-head"><strong>Today’s dispatch</strong><span class="badge">Live</span></div><div class="order-row"><strong>#SB-4827</strong><span>Jaipur → Pune</span><em class="badge">Pickup ready</em></div><div class="order-row"><strong>#SB-4826</strong><span>Surat → Kochi</span><em class="badge warn">In transit</em></div><div class="order-row"><strong>#SB-4825</strong><span>Delhi → Indore</span><em class="badge">Delivered</em></div><div class="order-row"><strong>#SB-4824</strong><span>Mumbai → Goa</span><em class="badge warn">Packed</em></div></div></div></div></section>
<section class="impact" id="impactCounters"><div class="shell impact-grid"><div><strong class="count-up" data-count="28" data-suffix="K+" aria-label="28 thousand plus">0</strong><span>delivery pin codes</span></div><div><strong class="count-up" data-count="85" data-suffix="+" aria-label="85 plus">0</strong><span>carrier services</span></div><div><strong class="count-up" data-count="220" data-suffix="+" aria-label="220 plus">0</strong><span>global destinations</span></div><div><strong class="count-up" data-count="24" data-suffix="×7" aria-label="24 by 7">0</strong><span>parcel visibility</span></div></div></section>
<section class="section" id="pricing"><div class="shell"><div class="section-head"><div><span class="eyebrow">BUILT TO GROW WITH YOU</span><h2>Useful from order one.</h2></div><p>Start with the tools you need today, then connect more channels and carrier options as volume grows.</p></div><div class="card-grid"><article class="info-card"><div class="icon-box">🌱</div><h3>Starter sellers</h3><p>Plan rates, check billable weight and keep early deliveries visible.</p></article><article class="info-card"><div class="icon-box">🛍</div><h3>Scaling brands</h3><p>Bring storefront orders together and build a repeatable dispatch rhythm.</p></article><article class="info-card"><div class="icon-box">🏢</div><h3>High-volume teams</h3><p>Coordinate routes, partners and shipment events across locations.</p></article></div></div></section>
${reviewWall()}
</main>${footer()}`;

const integrations = () => `${nav()}<main>${pageHero('SHIPBEES PLATFORM','Your stores, orders and deliveries—finally in sync.','Connect the places you sell with the delivery services you trust. ShipBees keeps handoffs organised as your business gets busier.')}${featureSection('CONNECTED COMMERCE','Choose what you want to connect.',[['🛒','Storefront connections','Bring ready-to-ship orders from your online shop into one organised list.','/integrations/sales-channels'],['🚚','Carrier connections','Compare route fit, speed and indicative cost across a wider delivery network.','/integrations/courier-partners'],['⚡','Workflow automations','Reduce repeated work with consistent labels, statuses and shipment rules.','/blogs']])}</main>${footer()}`;

const courierPartners = () => `${nav()}<main>${pageHero('DELIVERY NETWORK','The right service for each route, not one answer for every box.','Balance reach, speed and budget across a flexible group of delivery services. Pick the option that fits the shipment in front of you.')}${featureSection('A NETWORK WITH RANGE','More ways to get every order there.',[['⚡','Priority delivery','Choose quicker movement for urgent or high-value customer orders.'],['🛣','Economy ground','Control cost for routine parcels with dependable surface movement.'],['✈','Air-enabled routes','Reach distant destinations faster when the timeline matters.'],['◎','Broader coverage','Serve metro, emerging-city and harder-to-reach delivery zones.'],['🛡','Safer handoffs','Use milestone scans and clearer custody points for better shipment control.'],['⚑','Exception signals','Notice stalled pickups or late movement while your team can still act.']])}</main>${footer()}`;

const salesChannels = () => `${nav()}<main>${pageHero('SALES CHANNELS','Collect every order into one calm dispatch view.','Bring orders from storefronts, marketplaces and custom checkouts together, then keep shipment updates aligned with the source.')}${featureSection('SELL ANYWHERE','Keep fulfilment consistent everywhere.',[['🛍','Hosted storefronts','Sync orders from popular shop platforms into one ready-to-pack queue.'],['🏬','Marketplaces','Organise orders from multiple marketplaces without constant tab switching.'],['💬','Social selling','Turn conversational orders into a repeatable shipping process.'],['⌨','Custom commerce','Connect an in-house shop or checkout through APIs and webhooks.'],['▦','OMS and ERP','Keep order and shipping milestones aligned with operating systems.'],['↻','Status return','Send labels, AWBs and delivery events back to the originating channel.']])}</main>${footer()}`;

const calculatorShell = (type) => {
 const weight = type==='weight';
 return `${nav()}<main>${pageHero(weight?'BILLABLE WEIGHT':'RATE FINDER',weight?'Know what the carrier will weigh.':'Plan the cost before the parcel leaves.',weight?'Compare physical and volumetric weight using the final packed box dimensions. The larger value becomes your billable weight.':'Build a quick route estimate using origin, destination, package weight, speed and payment mode.',false)}<section class="calc-wrap"><div class="shell calc-layout"><form class="calculator" id="${weight?'weightForm':'rateForm'}" novalidate><h2>${weight?'Package details':'Shipment details'}</h2><p>${weight?'Measure the finished parcel in centimetres.':'Use valid six-digit Indian pin codes.'}</p>${weight?`
 <div class="field full"><label>Route type</label><div class="segmented" data-seg="route"><button type="button" class="active" data-value="domestic">Domestic</button><button type="button" data-value="international">International</button></div></div><div class="form-grid"><div class="field"><label for="length">Length (cm)</label><input id="length" name="length" type="number" min="1" placeholder="32"></div><div class="field"><label for="width">Width (cm)</label><input id="width" name="width" type="number" min="1" placeholder="24"></div><div class="field"><label for="height">Height (cm)</label><input id="height" name="height" type="number" min="1" placeholder="16"></div><div class="field"><label for="actual">Actual weight (kg)</label><input id="actual" name="actual" type="number" min="0.01" step="0.01" placeholder="1.40"></div></div><p id="formula" style="font-size:.85rem;margin:18px 0 0">Formula: L × W × H ÷ 5,000</p><button class="btn btn-primary form-submit" type="submit">Calculate billable weight →</button>`:`
 <div class="form-grid"><div class="field"><label for="pickup">Pickup pincode</label><input id="pickup" name="pickup" inputmode="numeric" maxlength="6" placeholder="302001"></div><div class="field"><label for="delivery">Delivery pincode</label><input id="delivery" name="delivery" inputmode="numeric" maxlength="6" placeholder="560001"></div><div class="field full"><label for="weight">Billable weight (kg)</label><input id="weight" name="weight" type="number" min="0.1" step="0.1" placeholder="0.75"></div><div class="field"><label>Delivery speed</label><div class="segmented" data-seg="speed"><button type="button" class="active" data-value="ground">Ground</button><button type="button" data-value="express">Express</button></div></div><div class="field"><label>Payment type</label><div class="segmented" data-seg="pay"><button type="button" class="active" data-value="prepaid">Prepaid</button><button type="button" data-value="cod">COD</button></div></div></div><button class="btn btn-primary form-submit" type="submit">Get indicative rate →</button>`}</form><aside class="result-card" id="calcResult"><div class="result-empty"><div class="result-icon">${weight?'◫':'₹'}</div><h3>${weight?'Your weight breakdown appears here':'Your route estimate appears here'}</h3><p>Complete the details to calculate instantly.</p></div></aside></div></section><section class="section"><div class="shell steps"><article class="step"><b>01</b><h3>${weight?'Measure after packing':'Add the route'}</h3><p>${weight?'Include the outermost points of the finished box.':'Enter the origin and destination pin codes.'}</p></article><article class="step"><b>02</b><h3>${weight?'Add physical weight':'Set your priorities'}</h3><p>${weight?'Include fillers, tape and the shipping label.':'Choose service speed and payment method.'}</p></article><article class="step"><b>03</b><h3>${weight?'Use the larger value':'Plan with the estimate'}</h3><p>${weight?'That is the likely billable figure.':'Review the indicative amount before booking.'}</p></article></div></section></main>${footer()}`;
};

const tracking = () => `${nav()}<main>${pageHero('PARCEL VISIBILITY','One ID. The whole delivery story.','Enter a ShipBees AWB or order number to view a friendly milestone timeline from pickup to doorstep.',false)}<section class="calc-wrap"><div class="shell calc-layout"><form class="calculator" id="trackForm"><h2>Track a parcel</h2><p>Try the demo ID <b>SB4827</b> to preview the experience.</p><div class="field"><label for="trackingId">AWB or order number</label><input id="trackingId" placeholder="e.g. SB4827"></div><button class="btn btn-primary form-submit" type="submit">Show delivery journey →</button><div id="trackMessage"></div></form><aside class="result-card" id="trackResult"><div class="result-empty"><div class="result-icon">⌖</div><h3>A simple timeline, when you need it</h3><p>Shipment milestones will appear here.</p></div></aside></div></section><section class="section"><div class="shell steps"><article class="step"><b>01</b><h3>Paste the shipment ID</h3><p>Use the AWB or order reference shared at dispatch.</p></article><article class="step"><b>02</b><h3>Read the latest event</h3><p>See the newest scan in an easy-to-follow timeline.</p></article><article class="step"><b>03</b><h3>Know what comes next</h3><p>Understand whether to wait or ask the team to step in.</p></article></div></section></main>${footer()}`;

const blogData=[['Packing','Box dimensions that prevent billing surprises','Measure the packed parcel—not the product—to understand volumetric charges before pickup.','6 min'],['Carrier choice','A practical scorecard for delivery partners','Compare reach, turnaround, support and total landed cost with the same checklist.','8 min'],['Planning','What actually changes a shipping rate?','A plain-language guide to distance, weight, service mode and payment fees.','7 min'],['Experience','Turn tracking updates into customer confidence','Use clearer milestone language to reduce “where is my order?” questions.','5 min'],['Operations','The 15-minute dispatch desk reset','Build a repeatable end-of-day routine for labels, manifests and exceptions.','6 min'],['Routing','Ground or air: choosing without guesswork','Balance urgency, distance and parcel economics with a simple decision tree.','7 min']];
const blogs = () => `${nav()}<main>${pageHero('SHIPBEES FIELD NOTES','Useful shipping advice, minus the jargon.','Short, practical playbooks for ecommerce teams that want calmer operations, smarter courier choices and happier customers.')}<section class="section"><div class="shell"><div class="center-head"><span class="eyebrow">LATEST PLAYBOOKS</span><h2>Small improvements that travel far.</h2></div><div class="blog-tools"><input id="blogSearch" type="search" placeholder="Search guides…"></div><div class="card-grid" id="blogGrid">${blogData.map((b,i)=>`<article class="info-card blog-card" data-search="${b.join(' ').toLowerCase()}"><div class="blog-art">${['📐','🚚','₹','📍','📦','✈️'][i]}</div><div class="blog-body"><small>${b[0]} · ${b[3]} read</small><h3>${b[1]}</h3><p>${b[2]}</p><a class="text-link" href="#">Read guide →</a></div></article>`).join('')}</div><p id="noBlogs" style="display:none;text-align:center;color:#647084">No guide matches that search yet.</p></div></section></main>${footer()}`;

const platformPage = () => `${nav()}<main class="platform-page">
  <section class="platform-hero"><div class="shell platform-hero-grid"><div><span class="page-kicker">THE OPERATING LAYER</span><h1>One workspace between every order and every doorstep.</h1><p>ShipBees brings incoming orders, shipment planning, labels, handoffs and delivery milestones into one connected operating view.</p><div class="hero-actions"><a class="btn btn-primary" href="/integrations">Explore integrations →</a><a class="btn platform-ghost" href="/tracking">Try tracking</a></div></div><div class="flow-board" aria-label="Illustrative order-to-delivery workflow"><div class="flow-head"><span>LIVE WORKFLOW</span><b>All systems connected</b></div><div class="flow-lane"><i>01</i><div><small>ORDERS</small><strong>Stores sync into one queue</strong></div><span>Ready</span></div><div class="flow-lane active"><i>02</i><div><small>DISPATCH</small><strong>Route and service selected</strong></div><span>Moving</span></div><div class="flow-lane"><i>03</i><div><small>VISIBILITY</small><strong>Milestones return to the team</strong></div><span>Live</span></div><div class="flow-pulse"></div></div></div></section>
  <section class="platform-ribbon"><div class="shell"><span>Connect</span><i>→</i><span>Prepare</span><i>→</i><span>Choose</span><i>→</i><span>Dispatch</span><i>→</i><span>Track</span></div></section>
  <section class="section platform-explain"><div class="shell"><div class="section-head"><div><span class="eyebrow">HOW IT COMES TOGETHER</span><h2>Built around the shipment lifecycle.</h2></div><p>Each part of the platform handles a specific moment, while sharing the same order and parcel context.</p></div><div class="platform-blocks"><article><b>01</b><h3>Collect the work</h3><p>Bring ready-to-ship orders from sales channels into one organised dispatch queue.</p><a href="/integrations/sales-channels">Sales channels →</a></article><article><b>02</b><h3>Plan the movement</h3><p>Check weight, route and service choices before confirming the shipment.</p><a href="/rate-calculator">Rate finder →</a></article><article><b>03</b><h3>Keep it visible</h3><p>Follow important scans and give support teams a timeline they can understand.</p><a href="/tracking">Parcel tracking →</a></article></div></div></section>
</main>${footer()}`;

const pricingPage = () => `${nav()}<main class="pricing-page">
  <section class="pricing-hero"><div class="shell pricing-hero-grid"><div><span class="page-kicker">CLEAR COST LOGIC</span><h1>Know what shapes a shipping rate.</h1><p>Shipping cost is not one flat number. Route, billable weight, speed and payment mode work together. ShipBees helps you check those inputs before booking.</p><a class="btn btn-dark" href="/rate-calculator">Build an estimate →</a></div><div class="price-receipt"><div class="receipt-head"><span>ILLUSTRATIVE BREAKDOWN</span><b>Shipment inputs</b></div><div><span>Route band</span><strong>Origin → destination</strong></div><div><span>Billable weight</span><strong>Physical or volumetric</strong></div><div><span>Service mode</span><strong>Ground or express</strong></div><div><span>Payment mode</span><strong>Prepaid or COD</strong></div><p>Final carrier charges depend on the selected service and actual shipment details.</p></div></div></section>
  <section class="section cost-anatomy"><div class="shell"><div class="center-head"><span class="eyebrow">RATE ANATOMY</span><h2>Four inputs worth checking first.</h2><p>A clearer estimate starts with accurate shipment information.</p></div><div class="cost-grid"><article><span>01</span><h3>Where it travels</h3><p>Origin and destination define the route band and available services.</p></article><article><span>02</span><h3>What it weighs</h3><p>Carriers usually compare physical and volumetric weight.</p></article><article><span>03</span><h3>How fast it moves</h3><p>Ground and express services balance delivery time and cost differently.</p></article><article><span>04</span><h3>How payment works</h3><p>COD shipments can include handling assumptions beyond prepaid movement.</p></article></div><div class="pricing-note"><strong>Need the billable weight first?</strong><p>Measure the packed box and compare both weight methods before estimating.</p><a href="/weight-calculator">Open weight checker →</a></div></div></section>
</main>${footer()}`;

const carriersPage = () => `${nav()}<main class="carriers-page">
  <section class="carrier-hero"><div class="shell carrier-hero-grid"><div><span class="page-kicker">FLEXIBLE DELIVERY NETWORK</span><h1>Choose the service that fits this parcel.</h1><p>Different shipments have different priorities. Compare reach, urgency and handling needs instead of forcing every order through one route.</p><a class="btn btn-primary" href="/rate-calculator">Compare a route →</a></div><div class="carrier-radar" aria-label="Illustrative delivery coverage radar"><div class="radar-ring r1"></div><div class="radar-ring r2"></div><div class="radar-ring r3"></div><div class="radar-core">SHIP<br>BEES</div><span class="radar-node n1">Metro</span><span class="radar-node n2">Regional</span><span class="radar-node n3">National</span><span class="radar-node n4">Cross-border</span><div class="radar-sweep"></div></div></div></section>
  <section class="carrier-modes"><div class="shell"><div class="section-head"><div><span class="eyebrow">SERVICE MODES</span><h2>A different lane for every priority.</h2></div><p>Use these operating modes as a decision guide; actual availability depends on the route and connected carrier services.</p></div><div class="mode-list"><article><i>↯</i><div><small>URGENT</small><h3>Priority delivery</h3><p>For time-sensitive orders where faster movement matters most.</p></div><span>Speed first</span></article><article><i>▰</i><div><small>EVERYDAY</small><h3>Economy ground</h3><p>For routine parcels where predictable surface movement supports cost control.</p></div><span>Balance</span></article><article><i>✈</i><div><small>LONG DISTANCE</small><h3>Air-enabled routes</h3><p>For distant destinations where the transit window needs extra help.</p></div><span>Reach</span></article></div></div></section>
  <section class="section carrier-checklist"><div class="shell"><div><span class="eyebrow">BEFORE YOU CHOOSE</span><h2>Check the shipment, not just the logo.</h2></div><ul><li><b>Coverage</b><span>Can the service reach the destination pin code?</span></li><li><b>Transit</b><span>Does the expected movement match the promise?</span></li><li><b>Handling</b><span>Does the parcel need COD, special care or stronger visibility?</span></li></ul></div></section>
</main>${footer()}`;

const learnPage = () => `${nav()}<main class="learn-page">
  <section class="learn-hero"><div class="shell learn-hero-grid"><div><span class="page-kicker">SHIPBEES FIELD NOTES</span><h1>Practical shipping knowledge for busy teams.</h1><p>Clear explanations, checklists and short playbooks for the decisions that show up between packing and delivery.</p></div><a class="featured-guide" href="#guide-library"><span>FEATURED GUIDE · 8 MIN</span><h2>A practical scorecard for choosing a delivery partner.</h2><p>Compare reach, turnaround, support and total landed cost using one repeatable checklist.</p><b>Read the guide →</b></a></div></section>
  <section class="learn-topics"><div class="shell"><span>Explore by topic</span><a href="#guide-library">Packing</a><a href="#guide-library">Carrier choice</a><a href="#guide-library">Planning</a><a href="#guide-library">Tracking</a><a href="#guide-library">Operations</a></div></section>
  <section class="section" id="guide-library"><div class="shell"><div class="section-head"><div><span class="eyebrow">THE GUIDE LIBRARY</span><h2>Answers you can use today.</h2></div><div class="blog-tools"><input id="blogSearch" type="search" placeholder="Search the library…"></div></div><div class="learn-grid" id="blogGrid">${blogData.map((b,i)=>`<article class="learn-card blog-card" data-search="${b.join(' ').toLowerCase()}"><div class="learn-card-no">0${i+1}</div><small>${b[0]} · ${b[3]} read</small><h3>${b[1]}</h3><p>${b[2]}</p><a href="#">Open field note →</a></article>`).join('')}</div><p id="noBlogs" style="display:none;text-align:center;color:#647084">No guide matches that search yet.</p></div></section>
</main>${footer()}`;

const login = () => `${nav()}<main class="login-section"><section class="login-art"><span class="eyebrow" style="color:#ffbf3f">MERCHANT WORKSPACE</span><h1>Your shipping day starts here.</h1><p>Opening the secure ShipBees user login with Email OTP and Email + password.</p></section><section class="login-panel"><div class="login-box"><span class="eyebrow">SECURE SIGN-IN</span><h2>Opening your login…</h2><p>If you are not redirected automatically, continue to the merchant workspace.</p><a class="btn btn-primary" href="${USER_PANEL_LOGIN}">Continue to login →</a></div></section></main>`;

const notFound = () => `${nav()}<main>${pageHero('WRONG TURN','That route has flown off the map.','The page you requested does not exist, but your next shipping task is only one click away.')}</main>${footer()}`;

const routes={
 '/':home,'/platform':platformPage,'/pricing':pricingPage,'/carriers':carriersPage,'/learn':learnPage,'/integrations':integrations,'/integrations/courier-partners':courierPartners,'/integrations/sales-channels':salesChannels,'/rate-calculator':()=>calculatorShell('rate'),'/weight-calculator':()=>calculatorShell('weight'),'/tracking':tracking,'/blogs':blogs,'/login':login
};
const path=location.pathname.replace(/\/$/,'')||'/';
if(path==='/login'){
  location.replace(USER_PANEL_LOGIN);
}else{
  $('#app').innerHTML=(routes[path]||notFound)();
}

$('.menu-btn')?.addEventListener('click',()=>$('#siteNav').classList.toggle('mobile-open'));
const solutionsToggle=$('.solutions-toggle'),solutionsDrop=solutionsToggle?.closest('.nav-drop');
solutionsToggle?.addEventListener('click',e=>{
  e.stopPropagation();const open=!solutionsDrop.classList.contains('open');
  solutionsDrop.classList.toggle('open',open);solutionsToggle.setAttribute('aria-expanded',String(open));
});
document.addEventListener('click',e=>{
  if(!solutionsDrop||solutionsDrop.contains(e.target))return;
  solutionsDrop.classList.remove('open');solutionsToggle.setAttribute('aria-expanded','false');
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&solutionsDrop){solutionsDrop.classList.remove('open');solutionsToggle.setAttribute('aria-expanded','false');solutionsToggle.focus()}});

const heroCarousel=$('#heroCarousel');
if(heroCarousel){
  const slides=$$('.hero-slide',heroCarousel),dots=$$('[data-hero-slide]',heroCarousel),stage=$('.hero-stage',heroCarousel),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current=0,timer=0,pressX=null;
  const paint=(next)=>{
    next=(next+slides.length)%slides.length;
    if(next===current)return;
    const previous=slides[current];
    previous.classList.remove('active');previous.classList.add('exit-left');previous.setAttribute('aria-hidden','true');
    setTimeout(()=>previous.classList.remove('exit-left'),900);
    current=next;
    slides.forEach((slide,index)=>{const active=index===current;slide.classList.toggle('active',active);slide.setAttribute('aria-hidden',String(!active))});
    dots.forEach((dot,index)=>{const active=index===current;dot.classList.toggle('active',active);dot.setAttribute('aria-selected',String(active))});
    $('#heroSceneNumber').textContent=String(current+1).padStart(2,'0');
    $('#heroSceneTitle').textContent=slides[current].dataset.scene;
  };
  const restart=()=>{clearInterval(timer);if(!reduced)timer=setInterval(()=>paint(current+1),5000)};
  $('#heroPrev').addEventListener('click',()=>{paint(current-1);restart()});
  $('#heroNext').addEventListener('click',()=>{paint(current+1);restart()});
  dots.forEach(dot=>dot.addEventListener('click',()=>{paint(Number(dot.dataset.heroSlide));restart()}));
  heroCarousel.addEventListener('mouseenter',()=>{clearInterval(timer);heroCarousel.classList.add('is-paused')});
  heroCarousel.addEventListener('mouseleave',()=>{heroCarousel.classList.remove('is-paused');stage.style.setProperty('--tilt-x','0deg');stage.style.setProperty('--tilt-y','0deg');heroCarousel.style.setProperty('--scene-x','0px');heroCarousel.style.setProperty('--scene-y','0px');restart()});
  heroCarousel.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;stage.style.setProperty('--tilt-x',`${(-y*7).toFixed(2)}deg`);stage.style.setProperty('--tilt-y',`${(x*9).toFixed(2)}deg`);heroCarousel.style.setProperty('--scene-x',`${(x*24).toFixed(1)}px`);heroCarousel.style.setProperty('--scene-y',`${(y*18).toFixed(1)}px`)});
  heroCarousel.addEventListener('pointerdown',e=>{pressX=e.clientX;heroCarousel.setPointerCapture?.(e.pointerId)});
  heroCarousel.addEventListener('pointerup',e=>{if(pressX!==null&&Math.abs(e.clientX-pressX)>45){paint(current+(e.clientX<pressX?1:-1));restart()}pressX=null;heroCarousel.releasePointerCapture?.(e.pointerId)});
  heroCarousel.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){paint(current+1);restart()}if(e.key==='ArrowLeft'){paint(current-1);restart()}});
  restart();
}

$$('.segmented').forEach(seg=>seg.addEventListener('click',e=>{if(e.target.tagName!=='BUTTON')return;$$('button',seg).forEach(b=>b.classList.remove('active'));e.target.classList.add('active');if(seg.dataset.seg==='route')$('#formula').textContent=`Formula: L × W × H ÷ ${e.target.dataset.value==='domestic'?'5,000':'4,500'}`;}));

const toolCopy={book:['SMART DISPATCH','Move packed orders without the busywork.','Review shipment details, compare a sensible service, and keep the handoff organised from the same workspace.','Estimate a route →','/rate-calculator'],watch:['LIVE MOMENTS','See trouble before customers feel it.','Follow every important scan in a readable timeline and bring delayed movement to the surface sooner.','Track a parcel →','/tracking'],learn:['BETTER DECISIONS','Turn everyday shipping into useful insight.','Notice patterns in cost, routes and exceptions so tomorrow’s courier choice is more informed.','Read field notes →','/blogs']};
$$('.tool-tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.tool-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const d=toolCopy[btn.dataset.tool];$('#toolLabel').textContent=d[0];$('#toolTitle').textContent=d[1];$('#toolCopy').textContent=d[2];$('#toolLink').textContent=d[3];$('#toolLink').href=d[4];}));

$('#rateForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),p=f.get('pickup')?.trim(),d=f.get('delivery')?.trim(),w=Number(f.get('weight'));if(!/^\d{6}$/.test(p)||!/^\d{6}$/.test(d)||w<=0){$('#calcResult').innerHTML='<div class="result-empty"><div class="result-icon">!</div><h3>Check the shipment details</h3><p>Use two six-digit pin codes and a weight above zero.</p></div>';return;}const speed=$('[data-seg="speed"] .active').dataset.value,pay=$('[data-seg="pay"] .active').dataset.value,distance=Math.abs(Number(p.slice(0,2))-Number(d.slice(0,2)));const zone=distance<8?'Local':distance<35?'Regional':'National';let amount=48+(w*22)+(distance*.85);if(speed==='express')amount*=1.48;if(pay==='cod')amount+=28;const days=speed==='express'?(distance<20?'1–2':'2–3'):(distance<20?'2–4':'4–7');$('#calcResult').innerHTML=`<span class="eyebrow" style="color:#ffbf3f">INDICATIVE TOTAL</span><div class="price">₹${Math.round(amount)}</div><p>Estimated amount including fuel and handling assumptions.</p><div class="result-list"><span><em>Route band</em><b>${zone}</b></span><span><em>Service</em><b>${speed==='express'?'Express':'Ground'}</b></span><span><em>Expected transit</em><b>${days} days</b></span><span><em>Payment</em><b>${pay==='cod'?'Cash on delivery':'Prepaid'}</b></span></div>`;});

$('#weightForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),l=Number(f.get('length')),w=Number(f.get('width')),h=Number(f.get('height')),a=Number(f.get('actual'));if([l,w,h,a].some(n=>!n||n<=0)){$('#calcResult').innerHTML='<div class="result-empty"><div class="result-icon">!</div><h3>Every measurement is needed</h3><p>Enter positive dimensions and the physical package weight.</p></div>';return;}const route=$('[data-seg="route"] .active').dataset.value,divisor=route==='domestic'?5000:4500,vol=l*w*h/divisor,charge=Math.max(a,vol);$('#calcResult').innerHTML=`<span class="eyebrow" style="color:#ffbf3f">BILLABLE WEIGHT</span><div class="price">${charge.toFixed(2)} kg</div><p>The higher of physical and volumetric weight.</p><div class="result-list"><span><em>Physical weight</em><b>${a.toFixed(2)} kg</b></span><span><em>Volumetric weight</em><b>${vol.toFixed(2)} kg</b></span><span><em>Divisor used</em><b>${divisor.toLocaleString('en-IN')}</b></span><span><em>Charged by</em><b>${vol>a?'Volume':'Physical weight'}</b></span></div>`;});

$('#trackForm')?.addEventListener('submit',e=>{e.preventDefault();const id=$('#trackingId').value.trim().toUpperCase();if(!id){$('#trackMessage').innerHTML='<p class="error">Enter an AWB or order number.</p>';return;}if(id!=='SB4827'){$('#trackMessage').innerHTML='<p class="success-note">This is a demo tracker. Use <b>SB4827</b> to see a sample journey.</p>';return;}$('#trackMessage').innerHTML='';$('#trackResult').innerHTML=`<span class="eyebrow" style="color:#ffbf3f">IN TRANSIT</span><h3>Order ${id}</h3><p>Jaipur → Pune · Expected tomorrow</p><div class="timeline"><div class="event"><strong>Reached Pune sorting centre</strong><small>Today · 06:45</small></div><div class="event"><strong>Departed Jaipur hub</strong><small>Yesterday · 21:10</small></div><div class="event"><strong>Parcel picked up</strong><small>Yesterday · 15:32</small></div><div class="event pending"><strong>Out for delivery</strong><small>Next milestone</small></div></div>`;});

$('#blogSearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();let count=0;$$('.blog-card').forEach(c=>{const show=c.dataset.search.includes(q);c.classList.toggle('hidden',!show);if(show)count++});$('#noBlogs').style.display=count?'none':'block';});
const impactCounters=$('#impactCounters');
if(impactCounters){
  const counters=$$('.count-up',impactCounters),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finalValue=counter=>`${counter.dataset.count}${counter.dataset.suffix||''}`;
  const runCounter=counter=>{
    const target=Number(counter.dataset.count),suffix=counter.dataset.suffix||'',duration=reduced?0:1650,start=performance.now();
    counter.classList.add('is-counting');
    const tick=now=>{
      const progress=duration?Math.min((now-start)/duration,1):1;
      const eased=1-Math.pow(1-progress,4);
      counter.textContent=`${Math.min(target,Math.floor(target*eased))}${progress===1?suffix:''}`;
      if(progress<1)requestAnimationFrame(tick);else{counter.textContent=finalValue(counter);counter.classList.remove('is-counting');counter.classList.add('is-complete')}
    };
    requestAnimationFrame(tick);
  };
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    impactCounters.classList.add('counters-visible');
    counters.forEach((counter,index)=>setTimeout(()=>runCounter(counter),reduced?0:index*90));
    observer.disconnect();
  }),{threshold:.42});
  observer.observe(impactCounters);
}

const networkStageEl=$('#networkStage');
if(networkStageEl){
  const routeConsole=$('#routeConsole'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const networkObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){networkStageEl.classList.add('is-visible');networkObserver.disconnect()}
  }),{threshold:.2});
  networkObserver.observe(networkStageEl);
  if(!reduced&&routeConsole){
    networkStageEl.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch')return;
      const r=networkStageEl.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      networkStageEl.style.setProperty('--mouse-x',`${(x*13).toFixed(1)}px`);
      networkStageEl.style.setProperty('--mouse-y',`${(y*9).toFixed(1)}px`);
    });
    networkStageEl.addEventListener('pointerleave',()=>{
      networkStageEl.style.setProperty('--mouse-x','0px');networkStageEl.style.setProperty('--mouse-y','0px');
    });
  }
}

const reviewWallEl=$('#reviewWall');
if(reviewWallEl){
  const reviewObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){reviewWallEl.classList.add('is-visible');reviewObserver.disconnect()}
  }),{threshold:.16});
  reviewObserver.observe(reviewWallEl);
}

const storyFanEl=$('#storyFan');
if(storyFanEl){
  const cards=$$('.story-card',storyFanEl),section=storyFanEl.closest('.story-section');let frame=0,dragging=false,startX=0,startY=0,dragX=0,dragY=0,pointerX=0,pointerY=0,scrollProgress=0;
  const mix=(a,b,p)=>a+(b-a)*p;
  const layout=()=>{const mobile=innerWidth<=600;cards.forEach((card,index)=>{const depth=Number(card.dataset.depth)||1;const fx=Number(card.dataset.fx),fy=Number(card.dataset.fy),fr=Number(card.dataset.fr),gx=mobile?0:Number(card.dataset.gx),gy=mobile?index*410:Number(card.dataset.gy);const p=mobile?1:scrollProgress;const x=mix(fx,gx,p)+(mobile?0:pointerX*depth+dragX),y=mix(fy,gy,p)+(mobile?0:pointerY*depth+dragY),rotation=mix(fr,0,p)+(mobile?0:pointerX*.065*depth);card.style.transform=`translate(calc(-50% + ${x}px),${y}px) rotate(${rotation}deg) scale(1)`})};
  const requestLayout=()=>{if(frame)return;frame=requestAnimationFrame(()=>{layout();frame=0})};
  const onScroll=()=>{const rect=section.getBoundingClientRect();scrollProgress=Math.max(0,Math.min(1,(180-rect.top)/620));storyFanEl.style.setProperty('--fan-progress',scrollProgress.toFixed(3));storyFanEl.classList.toggle('is-grid',scrollProgress>.92);storyFanEl.classList.toggle('is-visible',rect.top<innerHeight*.72&&rect.bottom>0);requestLayout()};
  const update=(clientX,clientY)=>{const r=storyFanEl.getBoundingClientRect(),nx=(clientX-r.left)/r.width-.5,ny=(clientY-r.top)/r.height-.5;pointerX=nx*34;pointerY=ny*22;const cursor=$('.story-cursor',storyFanEl);cursor.style.setProperty('--cx',`${clientX-r.left}px`);cursor.style.setProperty('--cy',`${clientY-r.top}px`);requestLayout()};
  storyFanEl.addEventListener('pointerenter',e=>{storyFanEl.classList.add('is-active');update(e.clientX,e.clientY)});
  storyFanEl.addEventListener('pointermove',e=>{if(dragging){dragX=Math.max(-90,Math.min(90,e.clientX-startX));dragY=Math.max(-35,Math.min(35,e.clientY-startY))}update(e.clientX,e.clientY)});
  storyFanEl.addEventListener('pointerleave',()=>{if(!dragging){storyFanEl.classList.remove('is-active');pointerX=0;pointerY=0;requestLayout()}});
  storyFanEl.addEventListener('pointerdown',e=>{dragging=true;startX=e.clientX-dragX;startY=e.clientY-dragY;storyFanEl.classList.add('is-dragging');storyFanEl.setPointerCapture?.(e.pointerId)});
  storyFanEl.addEventListener('pointerup',e=>{dragging=false;dragX=0;dragY=0;storyFanEl.classList.remove('is-dragging');storyFanEl.releasePointerCapture?.(e.pointerId);update(e.clientX,e.clientY)});
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);onScroll();
}
