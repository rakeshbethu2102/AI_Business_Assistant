import { useEffect, useState } from 'react'
import './App.css'

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

const formatCompact = (value) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)

function App() {
  const [data, setData] = useState(null)
  const [selectedRegion, setSelectedRegion] = useState('All')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [question, setQuestion] = useState('What is the total revenue?')
  const [answer, setAnswer] = useState('')
  const [supportingFigures, setSupportingFigures] = useState([])
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [refreshMinutes, setRefreshMinutes] = useState('0')
  const [selectedFile, setSelectedFile] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [conversation, setConversation] = useState([])

  const exampleQuestions = [
    'What is the total revenue?',
    'What is the revenue in North region?',
    'Which product sold the most?',
    'What is the average order value?',
  ]

  const submitQuestion = async (customQuestion = question) => {
    if (!customQuestion.trim()) {
      setError('Enter a question before asking the analyst.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/dashboard/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: customQuestion }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        setAnswer(json.error || 'Unable to answer that question.')
        setSupportingFigures([])
        return
      }

      setAnswer(json.answer)
      setSupportingFigures(json.supportingFigures || [])
      setConversation((history) => [
        { question: customQuestion, answer: json.answer },
        ...history,
      ].slice(0, 4))
    } catch (error) {
      setAnswer('The analytics API is temporarily unavailable.')
      setSupportingFigures([])
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDashboard = async () => {
    setDataLoading(true)
    try {
      const res = await fetch('/api/dashboard/sales')
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Failed to load dashboard')
      setData(json)
    } catch (loadError) {
      setError('Dashboard data could not be loaded. Check that the backend is running.')
      console.error('Failed to load sales dashboard:', loadError)
    } finally {
      setDataLoading(false)
    }
  }

  const importData = async () => {
    setImporting(true)
    setImportStatus('Importing data...')
    setError('')

    try {
      const body = selectedFile ? { csv: await selectedFile.text() } : {}
      const res = await fetch('/api/dashboard/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Import failed')
      setImportStatus(`${json.totalImported} rows imported from ${json.source === 'upload' ? 'your file' : 'the configured source'}.`)
      setSelectedFile(null)
      const fileInput = document.getElementById('data-file-input')
      if (fileInput) fileInput.value = ''
      await fetchDashboard()
    } catch (importError) {
      setImportStatus('')
      setError(importError.message)
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    let active = true

    const loadInitialDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard/sales')
        const json = await res.json()
        if (!res.ok) throw new Error(json.message || 'Failed to load dashboard')
        if (active) setData(json)
      } catch (loadError) {
        if (active) setError('Dashboard data could not be loaded. Check that the backend is running.')
        console.error('Failed to load dashboard:', loadError)
      } finally {
        if (active) setDataLoading(false)
      }
    }

    loadInitialDashboard()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const intervalMinutes = Number(refreshMinutes)
    if (!intervalMinutes) return undefined

    const interval = window.setInterval(() => {
      fetch('/api/dashboard/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(() => fetchDashboard())
        .catch((refreshError) => console.error('Scheduled import failed:', refreshError))
    }, intervalMinutes * 60 * 1000)

    return () => window.clearInterval(interval)
  }, [refreshMinutes])

  useEffect(() => {
    const sections = ['overview', 'analytics', 'insights']
    const updateActiveSection = () => {
      const current = sections.reduce((visibleSection, sectionId) => {
        const section = document.getElementById(sectionId)
        return section && section.getBoundingClientRect().top <= 160 ? sectionId : visibleSection
      }, 'overview')
      setActiveSection(current)
    }

    window.addEventListener('scroll', updateActiveSection, { passive: true })
    updateActiveSection()
    return () => window.removeEventListener('scroll', updateActiveSection)
  }, [])

  const resetFilters = () => {
    setSelectedRegion('All')
    setSelectedCategory('All')
  }

  const exportReport = () => {
    if (!filteredRecords.length) return

    const headers = ['Transaction_Id', 'Order_date', 'Product', 'Category', 'Region', 'Sales_channel', 'Quantity', 'Revenue']
    const rows = filteredRecords.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'insightflow-sales-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const filteredRecords = data?.records.filter((row) => {
    const regionMatch = selectedRegion === 'All' || row.Region === selectedRegion
    const categoryMatch = selectedCategory === 'All' || row.Category === selectedCategory
    return regionMatch && categoryMatch
  }) || []

  const revenue = filteredRecords.reduce((sum, row) => sum + row.Revenue, 0)
  const quantity = filteredRecords.reduce((sum, row) => sum + row.Quantity, 0)
  const summary = {
    revenue,
    quantity,
    avgOrder: filteredRecords.length ? revenue / filteredRecords.length : 0,
    orders: filteredRecords.length,
  }

  const regionOptions = data ? ['All', ...new Set(data.records.map((row) => row.Region).filter(Boolean))] : ['All']
  const categoryOptions = data ? ['All', ...new Set(data.records.map((row) => row.Category).filter(Boolean))] : ['All']

  const productTotals = filteredRecords.reduce((acc, row) => {
    acc[row.Product] = (acc[row.Product] || 0) + row.Revenue
    return acc
  }, {})
  const topProducts = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, productRevenue]) => ({ name, revenue: productRevenue }))

  const regionTotals = filteredRecords.reduce((acc, row) => {
    acc[row.Region] = (acc[row.Region] || 0) + row.Revenue
    return acc
  }, {})
  const regionChart = Object.entries(regionTotals).map(([region, regionRevenue]) => ({ region, revenue: regionRevenue }))

  const categoryTotals = filteredRecords.reduce((acc, row) => {
    acc[row.Category] = (acc[row.Category] || 0) + row.Revenue
    return acc
  }, {})
  const categoryChart = Object.entries(categoryTotals).map(([category, categoryRevenue]) => ({ category, revenue: categoryRevenue }))

  const maxRegionValue = regionChart.length ? Math.max(...regionChart.map((item) => item.revenue)) : 1
  const maxCategoryValue = categoryChart.length ? Math.max(...categoryChart.map((item) => item.revenue)) : 1

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">AI</div>
          <div>
            <p className="eyebrow">Business Suite</p>
            <h2>InsightFlow</h2>
          </div>
        </div>

        <nav className="nav" aria-label="Dashboard sections">
          <button type="button" className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => scrollTo('overview')}>Overview</button>
          <button type="button" className={`nav-item ${activeSection === 'analytics' ? 'active' : ''}`} onClick={() => scrollTo('analytics')}>Analytics</button>
          <button type="button" className={`nav-item ${activeSection === 'insights' ? 'active' : ''}`} onClick={() => scrollTo('insights')}>Insights</button>
        </nav>

        <div className="sidebar-card" role="status">
          <p className="eyebrow">AI Summary</p>
          <h3>{data ? `${summary.orders} orders in view` : 'Preparing your view'}</h3>
          <p>
            {data ? `Revenue is ${formatCurrency(summary.revenue)} across the active filters.` : 'Loading your sales intelligence.'}
          </p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar" id="overview">
          <div>
            <p className="eyebrow">Executive dashboard</p>
            <h1>AI Business Intelligence Assistant</h1>
            <p className="subtitle">Ask sharper questions. See the signal behind every sale.</p>
          </div>
          <button type="button" className="secondary-btn" onClick={exportReport} disabled={!filteredRecords.length}>
            Export report
          </button>
        </header>

        <section className="panel ask-panel" id="analytics">
          <div className="ai-hero-heading">
            <div>
              <span className="ai-pulse">●</span>
              <p className="eyebrow">AI analyst workspace</p>
              <h2>Ask anything about your business data</h2>
              <p className="ai-description">Explore revenue, products, customers, regions, channels, orders, discounts, and more using natural language.</p>
            </div>
            <span className="ai-mode">Grounded in imported data</span>
          </div>

          <div className="ask-controls">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitQuestion() }}
              placeholder="Try: Which category generated the most revenue?"
              aria-label="Ask the AI analyst a question"
            />
            <button type="button" className="primary-btn" onClick={() => submitQuestion()} disabled={loading || dataLoading}>
              {loading ? 'Analyzing...' : 'Ask analyst'}
            </button>
          </div>

          <div className="example-questions">
            {exampleQuestions.map((example) => (
              <button key={example} type="button" className="example-chip" onClick={() => { setQuestion(example); submitQuestion(example) }}>
                {example}
              </button>
            ))}
          </div>

          <div className="answer-box">
            <div className="answer-heading"><strong>Analyst answer</strong><span>Read-only analysis</span></div>
            <p>{loading ? 'The analyst is reviewing the active dataset...' : answer || 'Ask a question to begin exploring your data.'}</p>
            {supportingFigures.length > 0 && <div className="figure-grid">
              {supportingFigures.map((figure) => <div className="figure" key={figure.label}><span>{figure.label}</span><strong>{typeof figure.value === 'number' && figure.label !== 'Transactions' && figure.label !== 'Orders' && figure.label !== 'Units Sold' ? formatCurrency(figure.value) : figure.value}</strong></div>)}
            </div>}
          </div>

          {conversation.length > 1 && <div className="conversation-list">
            <span className="eyebrow">Recent analysis</span>
            {conversation.slice(1, 3).map((item) => <button type="button" className="conversation-item" key={`${item.question}-${item.answer}`} onClick={() => { setQuestion(item.question); setAnswer(item.answer) }}><span>{item.question}</span><strong>{item.answer}</strong></button>)}
          </div>}
        </section>

        <section className="toolbar" aria-label="Dashboard filters">
          <div className="filter-heading">
            <span className="eyebrow">Data view</span>
            <strong>Filter the workspace</strong>
          </div>
          <label>
            Region
            <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
              {regionOptions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <button type="button" className="text-btn" onClick={resetFilters}>Reset filters</button>
          <span className="data-status">{dataLoading ? 'Updating...' : `${filteredRecords.length} records`}</span>
        </section>

        <section className="import-strip" aria-label="Data import controls">
          <div>
            <span className="eyebrow">Data operations</span>
            <strong>Keep the workspace current</strong>
            <p>{importStatus || 'Upload a CSV now or refresh the configured dataset on a schedule.'}</p>
          </div>
          <div className="import-controls">
            <label className="file-picker">
              <span>{selectedFile ? selectedFile.name : 'Choose CSV'}</span>
              <input id="data-file-input" type="file" accept=".csv,text/csv" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
            </label>
            <button type="button" className="secondary-btn" onClick={importData} disabled={importing}>
              {importing ? 'Importing...' : 'Import data'}
            </button>
            <label className="schedule-picker">
              <span>Auto refresh</span>
              <select value={refreshMinutes} onChange={(event) => setRefreshMinutes(event.target.value)}>
                <option value="0">Off</option>
                <option value="15">Every 15 minutes</option>
                <option value="60">Every hour</option>
                <option value="1440">Every day</option>
              </select>
            </label>
          </div>
        </section>

        {error && <div className="notice" role="alert">{error}</div>}

        <section className="metrics-grid">
          <article className="metric-card">
            <p>Total Revenue</p>
            <h3>{data ? formatCurrency(summary.revenue) : 'Loading...'}</h3>
            <span>+14.8% vs period</span>
          </article>

          <article className="metric-card">
            <p>Units Sold</p>
            <h3>{data ? formatCompact(summary.quantity) : 'Loading...'}</h3>
            <span>+9.4% volume</span>
          </article>

          <article className="metric-card">
            <p>Orders</p>
            <h3>{data ? summary.orders : 'Loading...'}</h3>
            <span>+6.2% transactions</span>
          </article>

          <article className="metric-card">
            <p>Avg Order Value</p>
            <h3>{data ? formatCurrency(summary.avgOrder) : 'Loading...'}</h3>
            <span>+2.1% uplift</span>
          </article>
        </section>

        <section className="content-grid" id="insights">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Performance</p>
                <h3>Revenue by region</h3>
              </div>
            </div>

            <div className="bar-chart" aria-label="Region revenue chart">
              {regionChart.map((item) => (
                <div key={item.region} className="chart-col-group">
                  <div className="bar-value">{formatCurrency(item.revenue)}</div>
                  <div className="bar-wrapper">
                    <button
                      type="button"
                      className="bar-fill blue"
                      style={{ height: `${(item.revenue / maxRegionValue) * 100}%` }}
                      onClick={() => setSelectedRegion(item.region)}
                      title={`Filter to ${item.region}`}
                    />
                  </div>
                  <span className="bar-label">{item.region}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Portfolio</p>
                <h3>Category performance</h3>
              </div>
            </div>

            <div className="bar-chart compact" aria-label="Category revenue chart">
              {categoryChart.map((item) => (
                <div key={item.category} className="chart-col-group">
                  <div className="bar-value">{formatCurrency(item.revenue)}</div>
                  <div className="bar-wrapper">
                    <button
                      type="button"
                      className="bar-fill violet"
                      style={{ height: `${(item.revenue / maxCategoryValue) * 100}%` }}
                      onClick={() => setSelectedCategory(item.category)}
                      title={`Filter to ${item.category}`}
                    />
                  </div>
                  <span className="bar-label">{item.category}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Insights</p>
                <h3>Top products</h3>
              </div>
            </div>

            <div className="top-products">
              {topProducts.map((item, index) => (
                <div key={item.name} className="product-row">
                  <div className="rank">#{index + 1}</div>
                  <div className="product-info">
                    <strong>{item.name}</strong>
                    <span>{formatCurrency(item.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Operations</p>
                <h3>AI recommendations</h3>
              </div>
            </div>

            <ul className="activity-list">
              <li>Furniture continues to produce the highest revenue concentration.</li>
              <li>North region shows strongest repeat sales momentum across online orders.</li>
              <li>Monitor and desk categories offer the best upsell opportunities.</li>
              <li>Return rate remains controlled; monitor one returned order in the sample.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
