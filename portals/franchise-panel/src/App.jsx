import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Headphones,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPinned,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authStorage, portalApi } from './api'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/orders', label: 'Orders', icon: PackageCheck },
  { path: '/tracking', label: 'Tracking', icon: Truck },
  { path: '/ndr', label: 'NDR', icon: AlertTriangle },
  { path: '/rto', label: 'RTO', icon: RotateCcw },
  { path: '/territory-network', label: 'Territory Network', icon: MapPinned },
  { path: '/earnings', label: 'Earnings', icon: BadgeIndianRupee },
  { path: '/settlements', label: 'Settlements', icon: WalletCards },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/compliance', label: 'Compliance', icon: ShieldCheck },
  { path: '/team', label: 'Team', icon: Users },
  { path: '/support', label: 'Support', icon: Headphones },
]

const pageCopy = {
  '/overview': ['Overview', 'Your eligible orders, margin maturity, and network health.'],
  '/orders': ['Attributed Orders', 'Masked shipment visibility with a clear margin explanation.'],
  '/tracking': ['Shipment Tracking', 'Current movement and scan history for attributed shipments.'],
  '/ndr': ['NDR Operations', 'Delivery exceptions and attempts within your territory scope.'],
  '/rto': ['RTO Operations', 'Return movement, final state, and recorded return charges.'],
  '/territory-network': ['Territory Network', 'Coverage and child purchase status across your entitled area.'],
  '/earnings': ['Earnings', 'Follow margin from provisional calculation to reconciled payment.'],
  '/settlements': ['Settlements', 'Statements, withholding, payout state, and reconciliation evidence.'],
  '/reports': ['Reports', 'Operational and financial evidence within your permission scope.'],
  '/compliance': ['Compliance', 'Organization verification, tax documents, and active agreements.'],
  '/team': ['Team', 'Members, roles, permissions, and security enrollment.'],
  '/support': ['Support', 'Raise and track order, territory, margin, or payout questions.'],
}

const money = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100)

const date = (value, withTime = false) => {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

const labelize = (value) =>
  String(value || 'not set')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

function Status({ value }) {
  return <span className={`status status-${String(value || 'unknown').toLowerCase()}`}>{labelize(value)}</span>
}

function Brand({ compact = false, light = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <img src="/logo/shipbees-logo.svg" alt="ShipBees Logistics" />
      {!compact && (
        <div>
          <strong className={light ? 'text-white' : ''}>ShipBees</strong>
          <span className={light ? 'text-white-muted' : ''}>Franchise Network</span>
        </div>
      )}
    </div>
  )
}

function Login({ onLogin, navigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await portalApi.login(email, password)
      authStorage.save(response)
      onLogin(response.user)
      navigate('/overview', true)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to sign in. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-side">
        <div className="login-form-wrap">
          <Brand />
          <div className="login-copy">
            <span className="eyebrow"><LockKeyhole size={14} /> Secure partner access</span>
            <h1>Welcome back to your network.</h1>
            <p>
              Sign in to review attributed orders, territory coverage, margin maturity, and
              settlement evidence for your franchise.
            </p>
          </div>
          <form onSubmit={submit} className="login-form">
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}
            <button type="submit" className="primary-button login-button" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <>Sign in to portal <ArrowRight size={18} /></>}
            </button>
          </form>
          <div className="login-trust">
            <ShieldCheck size={17} />
            <span>Organization-scoped access</span>
            <span className="dot-separator" />
            <span>Privacy-masked order data</span>
          </div>
        </div>
      </section>
      <aside className="login-story">
        <div className="story-content">
          <span className="story-kicker">Your territory. Clearly accounted for.</span>
          <h2>Every eligible origin becomes a transparent earning story.</h2>
          <p>
            From pickup pincode to the final settlement, ShipBees keeps your entitled activity
            understandable without exposing merchant or platform-confidential data.
          </p>
          <div className="route-story" aria-label="Franchise earning lifecycle">
            {[
              ['01', 'Booked', 'Origin and active agreement are frozen'],
              ['02', 'Earned', 'Pickup confirms margin eligibility'],
              ['03', 'Approved', 'Final courier cost is reconciled'],
              ['04', 'Settled', 'Statement is reviewed and closed'],
            ].map(([step, title, detail], index) => (
              <div className="route-step" key={step}>
                <span className="route-number">{step}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
                {index < 3 && <span className="route-line" />}
              </div>
            ))}
          </div>
        </div>
        <div className="story-footer">
          <Brand compact light />
          <span>ShipBees Logistics</span>
        </div>
      </aside>
    </main>
  )
}

function usePortalData(loader) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'This page could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load, setData }
}

function PageState({ loading, error, reload, children }) {
  if (loading) {
    return <div className="page-state"><LoaderCircle className="spin" size={26} /><span>Loading your network</span></div>
  }
  if (error) {
    return (
      <div className="page-state page-state-error">
        <AlertTriangle size={27} />
        <strong>We could not load this page</strong>
        <span>{error}</span>
        <button className="secondary-button" onClick={reload}><RefreshCw size={16} /> Try again</button>
      </div>
    )
  }
  return children
}

function Metric({ label, value, detail, icon: Icon, tone = 'purple' }) {
  return (
    <div className="metric">
      <div>
        <span className="metric-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className={`metric-icon metric-${tone}`}><Icon size={20} /></span>
    </div>
  )
}

function SectionTitle({ title, detail, action }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  )
}

function Empty({ label }) {
  return (
    <div className="empty">
      <ClipboardCheck size={28} />
      <strong>No {label} yet</strong>
      <span>New records will appear here as the franchise workflow progresses.</span>
    </div>
  )
}

function OverviewPage() {
  const state = usePortalData(portalApi.dashboard)
  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="metric-grid four">
            <Metric label="Eligible orders" value={state.data.metrics.eligibleOrders} detail="Attributed to your agreements" icon={PackageCheck} />
            <Metric label="Provisional margin" value={money(state.data.metrics.provisionalPaise)} detail="Visible, not payable" icon={CalendarClock} tone="orange" />
            <Metric label="Approved margin" value={money(state.data.metrics.approvedPaise)} detail="Reconciled liability" icon={BadgeIndianRupee} tone="green" />
            <Metric label="Active territories" value={state.data.metrics.activeTerritories} detail="Current effective agreements" icon={MapPinned} tone="blue" />
          </div>
          <div className="overview-grid">
            <section className="surface">
              <SectionTitle title="Recent attributed orders" detail="Privacy-safe operational and margin status" />
              {state.data.recentOrders.length ? (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>AWB</th><th>Courier</th><th>Origin</th><th>Tier</th><th>Status</th></tr></thead>
                    <tbody>
                      {state.data.recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="strong">{order.awbMasked}</td>
                          <td>{order.courierProvider}</td>
                          <td>{order.originPincode}</td>
                          <td>{labelize(order.tier)}</td>
                          <td><Status value={order.attributionStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty label="attributed orders" />}
            </section>
            <aside className="surface action-center">
              <SectionTitle title="Action center" detail="Items that need attention" />
              <div className="action-list">
                <div><span className="action-icon amber"><CalendarClock size={17} /></span><p><strong>Settlement review</strong><small>Statements are manually reviewed before payout release.</small></p></div>
                <div><span className="action-icon green"><ShieldCheck size={17} /></span><p><strong>Organization access active</strong><small>Your data is scoped to this franchise organization.</small></p></div>
                {state.data.metrics.openDisputes > 0 && (
                  <div><span className="action-icon red"><AlertTriangle size={17} /></span><p><strong>{state.data.metrics.openDisputes} support item</strong><small>A response from ShipBees is pending.</small></p></div>
                )}
              </div>
              {state.data.nextSettlement && (
                <div className="settlement-forecast">
                  <span>Next settlement</span>
                  <strong>{money(state.data.nextSettlement.netPaise)}</strong>
                  <small>Cutoff {date(state.data.nextSettlement.periodEnd)}</small>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
    </PageState>
  )
}

function OrdersPage() {
  const state = usePortalData(portalApi.orders)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(
    () =>
      (state.data || []).filter((order) => {
        const matchesStatus = status === 'all' || order.attributionStatus === status
        const text = [order.awbMasked, order.courierProvider, order.originPincode, order.originCity]
          .join(' ')
          .toLowerCase()
        return matchesStatus && text.includes(search.trim().toLowerCase())
      }),
    [search, state.data, status],
  )

  return (
    <PageState {...state}>
      <div className="page-stack">
        <div className="filter-bar">
          <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search AWB, courier, city, or pincode" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All maturity states</option>
            {['provisional', 'earned', 'approved', 'paid', 'reversed'].map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
          </select>
        </div>
        <section className="surface table-surface">
          {filtered.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>AWB</th><th>Courier</th><th>Origin</th><th>Order state</th><th>Tier</th><th>Your margin</th><th /></tr></thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.id} onClick={() => setSelected(order)} className="clickable-row">
                      <td className="strong">{order.awbMasked}</td>
                      <td>{order.courierProvider}</td>
                      <td><span className="strong">{order.originPincode}</span><small className="cell-sub">{order.originCity}</small></td>
                      <td>{labelize(order.orderStatus)}</td>
                      <td>{labelize(order.tier)}</td>
                      <td><span className="strong">{money(order.earning?.amountPaise)}</span><small className="cell-sub"><Status value={order.earning?.state || order.attributionStatus} /></small></td>
                      <td><ChevronRight size={17} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty label="matching orders" />}
        </section>
        {selected && (
          <div className="drawer-backdrop" onClick={() => setSelected(null)}>
            <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div><span className="eyebrow">Margin detail</span><h2>{selected.awbMasked}</h2></div>
                <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close detail"><X size={20} /></button>
              </div>
              <Status value={selected.earning?.state || selected.attributionStatus} />
              <dl className="detail-list">
                <div><dt>Origin</dt><dd>{selected.originPincode}, {selected.originCity}, {selected.originState}</dd></div>
                <div><dt>Courier</dt><dd>{selected.courierProvider}</dd></div>
                <div><dt>Attributed tier</dt><dd>{labelize(selected.tier)}</dd></div>
                <div><dt>Rule</dt><dd>{selected.earning?.snapshot?.rule || 'Agreement default'} v{selected.ruleVersion}</dd></div>
                <div><dt>Your share</dt><dd>{Number(selected.earning?.snapshot?.shareBps || 0) / 100}%</dd></div>
                <div><dt>Margin</dt><dd className="large-value">{money(selected.earning?.amountPaise)}</dd></div>
                <div><dt>Maturity reason</dt><dd>{selected.earning?.snapshot?.reason || labelize(selected.attributionStatus)}</dd></div>
                <div><dt>Booked</dt><dd>{date(selected.bookedAt, true)}</dd></div>
              </dl>
              <div className="privacy-note"><ShieldCheck size={17} /><span>Courier cost, merchant PII, and other franchise shares are intentionally excluded.</span></div>
            </aside>
          </div>
        )}
      </div>
    </PageState>
  )
}

const operationConfig = {
  tracking: {
    loader: portalApi.tracking,
    timelineKey: 'trackingTimeline',
    latestKey: 'latestTracking',
    emptyLabel: 'tracked shipments',
    metricLabels: ['Shipments', 'In transit', 'Delivered', 'Exceptions'],
    metricKeys: ['total', 'inTransit', 'delivered', 'exceptions'],
    metricIcons: [Truck, RefreshCw, PackageCheck, AlertTriangle],
  },
  ndr: {
    loader: portalApi.ndr,
    timelineKey: 'ndrTimeline',
    latestKey: 'latestNdr',
    emptyLabel: 'NDR shipments',
    metricLabels: ['NDR shipments', 'Open', 'Resolved', 'Attempts'],
    metricKeys: ['total', 'open', 'resolved', 'attempts'],
    metricIcons: [AlertTriangle, CalendarClock, Check, RefreshCw],
  },
  rto: {
    loader: portalApi.rto,
    timelineKey: 'rtoTimeline',
    latestKey: 'latestRto',
    emptyLabel: 'RTO shipments',
    metricLabels: ['RTO shipments', 'In transit', 'Returned', 'RTO charges'],
    metricKeys: ['total', 'inTransit', 'delivered', 'chargesPaise'],
    metricIcons: [RotateCcw, Truck, PackageCheck, BadgeIndianRupee],
  },
}

function ShipmentTimelineDrawer({ shipment, kind, onClose }) {
  if (!shipment) return null
  const config = operationConfig[kind]
  const latest = shipment[config.latestKey]
  const timeline = shipment[config.timelineKey]?.length
    ? shipment[config.timelineKey]
    : latest
      ? [latest]
      : []

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="detail-drawer operations-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span className="eyebrow">{kind === 'tracking' ? 'Shipment timeline' : `${kind.toUpperCase()} detail`}</span>
            <h2>{shipment.awbMasked}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close detail"><X size={20} /></button>
        </div>
        <Status value={latest?.status || shipment.currentStatus} />
        <dl className="detail-list compact operation-facts">
          <div><dt>Courier</dt><dd>{shipment.courierProvider}</dd></div>
          <div><dt>Origin</dt><dd>{shipment.originPincode}, {shipment.originCity}</dd></div>
          <div><dt>Current state</dt><dd>{labelize(shipment.currentStatus)}</dd></div>
          <div><dt>Territory tier</dt><dd>{labelize(shipment.tier)}</dd></div>
          <div><dt>Booked</dt><dd>{date(shipment.bookedAt, true)}</dd></div>
          {kind === 'rto' && (
            <div><dt>Recorded RTO charges</dt><dd className="large-value">{money(shipment.totalRtoChargesPaise)}</dd></div>
          )}
        </dl>
        <div className="timeline-heading">
          <strong>{kind === 'tracking' ? 'Movement history' : 'Event history'}</strong>
          <span>{timeline.length} updates</span>
        </div>
        <div className="shipment-timeline">
          {[...timeline].reverse().map((event, index) => (
            <div className="timeline-event" key={event.id}>
              <span className={index === 0 ? 'timeline-dot current' : 'timeline-dot'} />
              <div>
                <div><strong>{labelize(event.status)}</strong><time>{date(event.createdAt, true)}</time></div>
                {event.description && <p>{event.description}</p>}
                <small>
                  {[event.location, event.attempt ? `Attempt ${event.attempt}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Operational update'}
                </small>
                {kind === 'rto' && event.chargesPaise > 0 && (
                  <span className="timeline-charge">{money(event.chargesPaise)}</span>
                )}
              </div>
            </div>
          ))}
          {!timeline.length && <Empty label="shipment events" />}
        </div>
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <span>Shipment visibility is limited to masked references and operational events within your territory.</span>
        </div>
      </aside>
    </div>
  )
}

function ShipmentOperationsPage({ kind }) {
  const config = operationConfig[kind]
  const state = usePortalData(config.loader)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(null)
  const shipments = state.data?.shipments || []
  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(
          shipments
            .map((shipment) => shipment[config.latestKey]?.status || shipment.currentStatus)
            .filter(Boolean),
        ),
      ),
    [config.latestKey, shipments],
  )
  const filtered = useMemo(
    () =>
      shipments.filter((shipment) => {
        const latest = shipment[config.latestKey]
        const shipmentStatus = latest?.status || shipment.currentStatus
        const text = [
          shipment.awbMasked,
          shipment.courierProvider,
          shipment.originPincode,
          shipment.originCity,
          shipmentStatus,
          latest?.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return (
          (status === 'all' || shipmentStatus === status) &&
          text.includes(search.trim().toLowerCase())
        )
      }),
    [config.latestKey, search, shipments, status],
  )

  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="metric-grid four">
            {config.metricLabels.map((label, index) => {
              const key = config.metricKeys[index]
              const Icon = config.metricIcons[index]
              const value =
                key === 'chargesPaise' ? money(state.data.summary[key]) : state.data.summary[key]
              return (
                <Metric
                  key={key}
                  label={label}
                  value={value}
                  detail={kind === 'tracking' ? 'Attributed shipment scope' : 'Operational event scope'}
                  icon={Icon}
                  tone={index === 1 ? 'orange' : index === 2 ? 'green' : index === 3 ? 'blue' : 'purple'}
                />
              )
            })}
          </div>
          <div className="filter-bar">
            <label className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search AWB, courier, status, city, or pincode"
              />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All operational states</option>
              {statusOptions.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
            </select>
          </div>
          <section className="surface table-surface">
            {filtered.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>AWB</th>
                      <th>Courier</th>
                      <th>Origin</th>
                      <th>Current state</th>
                      <th>{kind === 'tracking' ? 'Latest scan' : kind === 'ndr' ? 'Reason / attempt' : 'RTO charges'}</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((shipment) => {
                      const latest = shipment[config.latestKey]
                      return (
                        <tr key={shipment.id} className="clickable-row" onClick={() => setSelected(shipment)}>
                          <td className="strong">{shipment.awbMasked}</td>
                          <td>{shipment.courierProvider}</td>
                          <td><span className="strong">{shipment.originPincode}</span><small className="cell-sub">{shipment.originCity}</small></td>
                          <td><Status value={latest?.status || shipment.currentStatus} /></td>
                          <td>
                            {kind === 'rto' ? (
                              <span className="strong">{money(shipment.totalRtoChargesPaise)}</span>
                            ) : (
                              <><span className="strong">{latest?.description || labelize(shipment.currentStatus)}</span>{latest?.attempt && <small className="cell-sub">Attempt {latest.attempt}</small>}</>
                            )}
                          </td>
                          <td>{date(latest?.createdAt || shipment.updatedAt, true)}</td>
                          <td><ChevronRight size={17} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Empty label={config.emptyLabel} />}
          </section>
          <ShipmentTimelineDrawer
            shipment={selected}
            kind={kind}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </PageState>
  )
}

const TrackingPage = () => <ShipmentOperationsPage kind="tracking" />
const NdrPage = () => <ShipmentOperationsPage kind="ndr" />
const RtoPage = () => <ShipmentOperationsPage kind="rto" />

function PincodeRows({ rows }) {
  if (!rows.length) return <Empty label="pincodes" />
  return (
    <div className="coverage-pincode-list">
      {rows.map((pincode) => (
        <div className="coverage-pincode-row" key={pincode.id}>
          <span className="pincode-marker"><MapPinned size={15} /></span>
          <span>
            <strong>{pincode.pincode}</strong>
            <small>{pincode.city || pincode.district}, {pincode.state}</small>
          </span>
          <Status value={pincode.status} />
        </div>
      ))}
    </div>
  )
}

function DirectPincodeTerritory({ agreement, root }) {
  return (
    <div className="direct-territory">
      <div className="direct-pin">
        <span><MapPinned size={24} /></span>
        <div>
          <small>Exact origin territory</small>
          <strong>{root?.pincode || agreement.pincode}</strong>
          <p>{root?.city || agreement.city || agreement.district}, {agreement.state}</p>
        </div>
        <Status value={root?.status || agreement.agreementStatus} />
      </div>
      <dl className="territory-facts">
        <div><dt>Agreement</dt><dd>{agreement.agreementNumber}</dd></div>
        <div><dt>Commission share</dt><dd>{Number(agreement.shareBps || 0) / 100}%</dd></div>
        <div><dt>Effective until</dt><dd>{date(agreement.endsAt)}</dd></div>
        <div><dt>Lower territories</dt><dd>None · final coverage level</dd></div>
      </dl>
    </div>
  )
}

function TerritoryScope({ agreement, network, search }) {
  const root = network.find((item) => item.id === agreement.rootId)
  if (!root) return null
  if (root.type === 'pincode') {
    return (
      <section className="surface coverage-scope">
        <div className="coverage-scope-head">
          <div>
            <span className="eyebrow">{agreement.productName}</span>
            <h2>{agreement.path.join(' / ')}</h2>
          </div>
          <Status value={agreement.agreementStatus} />
        </div>
        <DirectPincodeTerritory agreement={agreement} root={root} />
      </section>
    )
  }

  const districts =
    root.type === 'state'
      ? network.filter((item) => item.type === 'district_city' && item.parentId === root.id)
      : [root]
  const normalizedSearch = search.trim().toLowerCase()
  const groups = districts
    .map((district) => {
      const pincodes = network.filter(
        (item) => item.type === 'pincode' && item.parentId === district.id,
      )
      const filteredPincodes = normalizedSearch
        ? pincodes.filter((item) =>
            [item.pincode, item.name, item.city, item.district, item.state]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
          )
        : pincodes
      return {
        district,
        pincodes: filteredPincodes,
        totalPincodes: pincodes.length,
      }
    })
    .filter(
      ({ district, pincodes }) =>
        !normalizedSearch ||
        district.name.toLowerCase().includes(normalizedSearch) ||
        pincodes.length,
    )

  return (
    <section className="surface coverage-scope">
      <div className="coverage-scope-head">
        <div>
          <span className="eyebrow">{agreement.productName}</span>
          <h2>{agreement.path.join(' / ')}</h2>
          <p>{agreement.agreementNumber} · valid until {date(agreement.endsAt)}</p>
        </div>
        <Status value={agreement.agreementStatus} />
      </div>
      <div className="scope-counts">
        <div><strong>{agreement.descendantCounts.districtCities}</strong><span>Districts / Cities</span></div>
        <div><strong>{agreement.descendantCounts.pincodes}</strong><span>Pincodes</span></div>
        <div><strong>{agreement.descendantCounts.booked}</strong><span>Booked below</span></div>
        <div><strong>{agreement.descendantCounts.available}</strong><span>Available below</span></div>
      </div>
      <div className="coverage-branches">
        {groups.map(({ district, pincodes, totalPincodes }, index) => (
          <details className="coverage-branch" key={district.id} open={groups.length === 1 || index === 0}>
            <summary>
              <span className="branch-chevron"><ChevronDown size={17} /></span>
              <span>
                <strong>{district.name}</strong>
                <small>{totalPincodes} pincodes</small>
              </span>
              <Status value={district.status} />
            </summary>
            <PincodeRows rows={pincodes} />
          </details>
        ))}
        {!groups.length && <Empty label="matching territories" />}
      </div>
    </section>
  )
}

function TerritoriesPage() {
  const state = usePortalData(portalApi.territories)
  const [search, setSearch] = useState('')

  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="metric-grid three">
            <Metric
              label="Your agreements"
              value={state.data.owned.length}
              detail="Current territory entitlements"
              icon={FileCheck2}
              tone="purple"
            />
            <Metric
              label="Districts / Cities"
              value={state.data.summary.district_city.total}
              detail="Visible within your coverage"
              icon={Building2}
              tone="blue"
            />
            <Metric
              label="Pincodes"
              value={state.data.summary.pincode.total}
              detail="Exact origin areas in scope"
              icon={MapPinned}
              tone="green"
            />
          </div>

          {state.data.network.some((item) => item.type !== 'pincode') && (
            <div className="territory-toolbar">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a district, city, or pincode"
                />
              </label>
              <div className="inventory-key">
                <Status value="booked" />
                <Status value="reserved" />
                <Status value="available" />
              </div>
            </div>
          )}

          <div className="coverage-list">
            {state.data.owned.map((agreement) => (
              <TerritoryScope
                key={agreement.agreementId}
                agreement={agreement}
                network={state.data.network}
                search={search}
              />
            ))}
            {!state.data.owned.length && <section className="surface"><Empty label="active territories" /></section>}
          </div>
        </div>
      )}
    </PageState>
  )
}

function EarningsPage() {
  const state = usePortalData(portalApi.earnings)
  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="metric-grid six">
            {[
              ['Provisional', state.data.totals.provisionalPaise, CalendarClock, 'orange'],
              ['Earned', state.data.totals.earnedPaise, PackageCheck, 'blue'],
              ['Approved', state.data.totals.approvedPaise, FileCheck2, 'green'],
              ['Settled', state.data.totals.settledPaise, WalletCards, 'blue'],
              ['Paid', state.data.totals.paidPaise, BadgeIndianRupee, 'purple'],
              ['Reversed', state.data.totals.reversedPaise, RefreshCw, 'red'],
            ].map(([label, value, Icon, tone]) => <Metric key={label} label={label} value={money(value)} detail="Franchise ledger" icon={Icon} tone={tone} />)}
          </div>
          <section className="surface earning-policy">
            <div>
              <span><CalendarClock size={18} /></span>
              <p><strong>Provisional ledger</strong><small>Estimated earning awaiting shipment outcome and final courier-cost reconciliation.</small></p>
            </div>
            <div>
              <span><ShieldCheck size={18} /></span>
              <p><strong>Commission cap</strong><small>The maximum combined profit-share percentage allowed for one shipment.</small></p>
            </div>
            <div>
              <span><RefreshCw size={18} /></span>
              <p><strong>Credits and debits</strong><small>Positive entries increase earnings; adjustments and reversals are recorded as separate negative entries.</small></p>
            </div>
          </section>
          <section className="surface table-surface">
            <SectionTitle title="Margin ledger" detail="Immutable earnings, adjustments, and reversals" />
            {state.data.entries.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>AWB</th><th>Origin</th><th>Courier</th><th>Tier</th><th>Entry</th><th>Amount</th><th>State</th></tr></thead>
                  <tbody>
                    {state.data.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="strong">{entry.awbMasked || 'Adjustment'}</td>
                        <td>{entry.originPincode || 'Not linked'}</td>
                        <td>{entry.courierProvider || 'Finance'}</td>
                        <td>{labelize(entry.tier)}</td>
                        <td>{labelize(entry.entryType)}</td>
                        <td className={Number(entry.amountPaise) < 0 ? 'negative strong' : 'strong'}>{money(entry.amountPaise)}</td>
                        <td><Status value={entry.state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty label="ledger entries" />}
          </section>
        </div>
      )}
    </PageState>
  )
}

function SettlementsPage() {
  const state = usePortalData(portalApi.settlements)
  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="settlement-review-banner"><ShieldCheck size={20} /><div><strong>Manual settlement controls are active.</strong><span>Statements are reviewed and reconciled before payout automation is enabled.</span></div></div>
          <section className="surface table-surface">
            <SectionTitle title="Settlement history" detail="Gross, adjustments, withholding, and net payout" />
            {state.data.settlements.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Settlement</th><th>Period</th><th>Gross</th><th>Adjustments</th><th>Withholding</th><th>Net payout</th><th>Status</th></tr></thead>
                  <tbody>
                    {state.data.settlements.map((item) => (
                      <tr key={item.id}>
                        <td className="strong">{item.settlementNumber}</td>
                        <td>{date(item.periodStart)} - {date(item.periodEnd)}</td>
                        <td>{money(item.grossPaise)}</td>
                        <td>{money(item.adjustmentsPaise)}</td>
                        <td>{money(item.withholdingPaise)}</td>
                        <td className="strong">{money(item.netPaise)}</td>
                        <td><Status value={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty label="settlements" />}
          </section>
          <section className="surface table-surface">
            <SectionTitle title="Payout evidence" detail="Provider and reconciliation state for closed settlements" />
            {state.data.payouts.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Provider reference</th><th>Amount</th><th>Processed</th><th>Reconciled</th><th>Status</th></tr></thead>
                  <tbody>{state.data.payouts.map((item) => <tr key={item.id}><td className="strong">{item.providerReference || 'Pending reference'}</td><td>{money(item.amountPaise)}</td><td>{date(item.processedAt)}</td><td>{date(item.reconciledAt)}</td><td><Status value={item.status} /></td></tr>)}</tbody>
                </table>
              </div>
            ) : <Empty label="payout records" />}
          </section>
        </div>
      )}
    </PageState>
  )
}

function ReportsPage() {
  const state = usePortalData(portalApi.reports)
  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <div className="metric-grid three">
            <Metric label="Attributed orders" value={state.data.summary.orderCount} detail="Current scoped records" icon={PackageCheck} />
            <Metric label="Ledger total" value={money(state.data.summary.totalEarningsPaise)} detail="Includes adjustments and reversals" icon={BadgeIndianRupee} tone="green" />
            <Metric label="Settlements" value={state.data.summary.settlementCount} detail="Statement periods" icon={FileCheck2} tone="blue" />
          </div>
          <section>
            <SectionTitle title="Report catalog" detail="Exports retain the same masking and permissions as the screen" />
            <div className="report-grid">
              {state.data.reports.map((report) => (
                <article className="report-item" key={report.id}>
                  <span className="report-icon"><FileText size={20} /></span>
                  <div><strong>{report.name}</strong><small>{report.format} - Permission-scoped</small></div>
                  <Status value={report.status} />
                  <button className="icon-button" disabled={report.status !== 'ready'} aria-label={`Download ${report.name}`} title={`Download ${report.name}`}><Download size={18} /></button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </PageState>
  )
}

function CompliancePage() {
  const state = usePortalData(portalApi.documents)
  return (
    <PageState {...state}>
      {state.data && (
        <div className="page-stack">
          <section className="surface compliance-profile">
            <div>
              <span className="eyebrow">Organization profile</span>
              <h2>{state.data.organization.tradeName}</h2>
              <p>{state.data.organization.legalName}</p>
            </div>
            <Status value={state.data.organization.status} />
          </section>
          <div className="compliance-grid">
            {state.data.compliance.map((item) => (
              <div className="compliance-item" key={item.type}>
                <span className="compliance-icon"><FileCheck2 size={20} /></span>
                <div><strong>{item.type}</strong><small>Organization verification</small></div>
                <Status value={item.status} />
              </div>
            ))}
          </div>
          <section className="surface table-surface">
            <SectionTitle title="Franchise agreements" detail="Current accepted commercial versions" />
            {state.data.agreements.length ? (
              <div className="table-scroll"><table><thead><tr><th>Agreement</th><th>Territory</th><th>Version</th><th>Effective period</th><th>Status</th></tr></thead><tbody>{state.data.agreements.map((item) => <tr key={item.id}><td className="strong">{item.agreementNumber}</td><td>{item.territory}</td><td>{item.version}</td><td>{date(item.startsAt)} - {date(item.endsAt)}</td><td><Status value={item.status} /></td></tr>)}</tbody></table></div>
            ) : <Empty label="agreements" />}
          </section>
        </div>
      )}
    </PageState>
  )
}

function TeamPage() {
  const state = usePortalData(portalApi.team)
  return (
    <PageState {...state}>
      <section className="surface table-surface">
        <SectionTitle title="Organization members" detail="Role and permission decisions are enforced on the server" />
        {state.data?.length ? (
          <div className="table-scroll"><table><thead><tr><th>Member</th><th>Role</th><th>Permissions</th><th>MFA</th><th>Joined</th><th>Status</th></tr></thead><tbody>{state.data.map((member) => <tr key={member.id}><td className="strong">{member.email}</td><td>{labelize(member.role)}</td><td>{member.permissions?.join(', ')}</td><td><Status value={member.mfaStatus} /></td><td>{date(member.joinedAt)}</td><td><Status value={member.isActive ? 'active' : 'suspended'} /></td></tr>)}</tbody></table></div>
        ) : <Empty label="team members" />}
      </section>
    </PageState>
  )
}

function SupportPage() {
  const state = usePortalData(portalApi.disputes)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'general', subject: '', description: '' })

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await portalApi.createDispute(form)
      setOpen(false)
      setForm({ type: 'general', subject: '', description: '' })
      state.reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageState {...state}>
      <div className="page-stack">
        <div className="page-actions-row">
          <p>Use support for missing attribution, territory, margin, statement, or payout questions.</p>
          <button className="primary-button" onClick={() => setOpen(true)}><Plus size={17} /> New support item</button>
        </div>
        <section className="surface table-surface">
          {state.data?.length ? (
            <div className="table-scroll"><table><thead><tr><th>Subject</th><th>Type</th><th>Priority</th><th>Opened</th><th>Status</th></tr></thead><tbody>{state.data.map((item) => <tr key={item.id}><td><span className="strong">{item.subject}</span><small className="cell-sub">{item.description}</small></td><td>{labelize(item.type)}</td><td><Status value={item.priority} /></td><td>{date(item.createdAt)}</td><td><Status value={item.status} /></td></tr>)}</tbody></table></div>
          ) : <Empty label="support items" />}
        </section>
        {open && (
          <div className="modal-backdrop" onClick={() => setOpen(false)}>
            <form className="modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
              <div className="modal-header"><div><span className="eyebrow">ShipBees Support</span><h2>New support item</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={20} /></button></div>
              <label>Category<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="general">General</option><option value="order">Missing order</option><option value="territory">Territory</option><option value="margin">Margin</option><option value="settlement">Settlement</option><option value="payout">Payout</option></select></label>
              <label>Subject<input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required /></label>
              <label>Description<textarea rows="5" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required /></label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Headphones size={17} />} Submit</button></div>
            </form>
          </div>
        )}
      </div>
    </PageState>
  )
}

function PortalShell({ profile, onLogout, path, navigate }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [me, setMe] = useState(null)
  const [title, subtitle] = pageCopy[path] || pageCopy['/overview']

  useEffect(() => {
    portalApi.me().then(setMe).catch(() => {})
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [path])

  const pageComponents = {
    '/overview': <OverviewPage />,
    '/orders': <OrdersPage />,
    '/tracking': <TrackingPage />,
    '/ndr': <NdrPage />,
    '/rto': <RtoPage />,
    '/territory-network': <TerritoriesPage />,
    '/earnings': <EarningsPage />,
    '/settlements': <SettlementsPage />,
    '/reports': <ReportsPage />,
    '/compliance': <CompliancePage />,
    '/team': <TeamPage />,
    '/support': <SupportPage />,
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><Brand light /><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
        <div className="organization-chip">
          <span>{(profile?.organization?.name || 'ShipBees Franchise').slice(0, 1)}</span>
          <div><strong>{profile?.organization?.name || 'Franchise organization'}</strong><small>{labelize(profile?.role || 'member')}</small></div>
        </div>
        <nav>
          {navItems.map(({ path: itemPath, label, icon: Icon }) => (
            <a
              key={itemPath}
              href={itemPath}
              className={`nav-item ${path === itemPath ? 'active' : ''}`}
              onClick={(event) => {
                event.preventDefault()
                navigate(itemPath)
              }}
            >
              <Icon size={18} /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="security-state"><ShieldCheck size={17} /><span><strong>Scoped access</strong><small>{me?.organization?.status === 'active' ? 'Organization active' : 'Verified session'}</small></span></div>
          <button className="logout-button" onClick={onLogout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div><span>ShipBees Franchise Network</span><strong>{profile?.organization?.name}</strong></div>
          <span className="profile-mark">{profile?.email?.slice(0, 1).toUpperCase()}</span>
        </header>
        <main className="portal-main">
          <header className="page-header">
            <div><span className="eyebrow">Franchise Portal</span><h1>{title}</h1><p>{subtitle}</p></div>
            <span className="as-of"><CalendarClock size={15} /> Updated {date(new Date(), true)}</span>
          </header>
          {pageComponents[path] || pageComponents['/overview']}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [profile, setProfile] = useState(authStorage.getProfile())
  const [path, setPath] = useState(window.location.pathname)
  const loggedIn = Boolean(authStorage.getAccess() && profile)

  const navigate = useCallback((nextPath, replace = false) => {
    if (replace) window.history.replaceState({}, '', nextPath)
    else window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }, [])

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!loggedIn && path !== '/login') navigate('/login', true)
    if (loggedIn && (path === '/login' || !pageCopy[path])) navigate('/overview', true)
  }, [loggedIn, navigate, path])

  const logout = () => {
    authStorage.clear()
    setProfile(null)
    navigate('/login', true)
  }

  if (!loggedIn) return <Login onLogin={setProfile} navigate={navigate} />

  return <PortalShell profile={profile} onLogout={logout} path={path} navigate={navigate} />
}
