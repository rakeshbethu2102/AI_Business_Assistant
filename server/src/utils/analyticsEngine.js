const DIMENSIONS = {
  region: { field: 'Region', label: 'region' },
  category: { field: 'Category', label: 'category' },
  product: { field: 'Product', label: 'product' },
  channel: { field: 'Sales_channel', label: 'sales channel' },
  status: { field: 'Status', label: 'status' },
  customer: { field: 'Customer_Id', label: 'customer' },
  date: { field: 'Order_date', label: 'date' },
}

const METRICS = {
  revenue: { field: 'Revenue', label: 'revenue', currency: true },
  sales: { field: 'Revenue', label: 'sales', currency: true },
  income: { field: 'Revenue', label: 'income', currency: true },
  quantity: { field: 'Quantity', label: 'units sold', currency: false },
  units: { field: 'Quantity', label: 'units sold', currency: false },
  orders: { field: 'Transaction_Id', label: 'orders', count: true },
  transactions: { field: 'Transaction_Id', label: 'transactions', count: true },
  discount: { field: 'Discount_amount', label: 'discounts', currency: true },
  price: { field: 'Unit_price', label: 'unit price', currency: true },
}

const METRIC_ALIASES = {
  revenue: ['revenue', 'sales', 'sales amount', 'sales value', 'turnover', 'money made', 'money earned', 'earnings', 'income', 'amount made', 'amount earned', 'total amount', 'average order value', 'avg order value', 'average transaction value'],
  quantity: ['quantity', 'quantities', 'units', 'items', 'item count', 'volume sold'],
  orders: ['orders', 'order count', 'number of orders', 'how many orders', 'transactions', 'transaction count', 'number of transactions'],
  discount: ['discount', 'discounts', 'discount amount', 'savings'],
  price: ['price', 'unit price', 'cost per item', 'average price'],
}

const normalizeText = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, ' ')
const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const uniqueValues = (records, field) => [...new Set(records.map((row) => row[field]).filter(Boolean))]

const parseQuestion = (question = '', records = []) => {
  const raw = String(question || '').trim()
  const cleaned = normalizeText(raw)

  if (!raw) return { valid: false, error: 'Question is empty. Please ask a valid business question.' }

  const destructivePatterns = ['delete', 'drop', 'truncate', 'destroy', 'remove all', 'update all', 'insert into', 'alter table']
  if (destructivePatterns.some((pattern) => cleaned.includes(pattern))) {
    return { valid: false, error: 'Unsupported or destructive request. This system only supports read-only business analytics.' }
  }

  if (/\b(next year|next month|future|forecast|predict|will)\b/i.test(cleaned)) {
    return { valid: false, error: 'Forecasting is not available yet because the question requires a metric calculation from future data. I can answer historical questions about the imported dataset.' }
  }

  const metric = findMetric(cleaned) || (/(\bhow much did we make\b|\bmade overall\b|\bearnings\b)/i.test(cleaned) ? METRICS.revenue : null)
  const dimension = findDimension(cleaned)
  const value = findDimensionValue(raw, dimension, records)
  const values = findDimensionValues(raw, dimension, records)
  const ranking = /\b(top|highest|best|largest|maximum|max|most|bottom|lowest|worst|smallest|minimum|min|least)\b/i.exec(cleaned)
  const comparison = /\b(compare|comparison|versus|vs\.?|difference|between)\b/i.test(cleaned)
  const average = /\b(average|avg|mean)\b/i.test(cleaned)
  const total = /\b(total|sum|overall|how much|how many)\b/i.test(cleaned)
  const list = /\b(list|show|breakdown|by each|per)\b/i.test(cleaned)

  if (metric?.field === 'Revenue' && /\btotal revenue\b|\boverall revenue\b/i.test(cleaned) && !dimension) {
    return { valid: true, intent: 'total_revenue', metric }
  }

  if (comparison) return { valid: true, intent: 'comparison', metric: metric || METRICS.revenue, dimension: dimension || DIMENSIONS.region, value, values }

  if (metric?.field === 'Revenue' && dimension?.field === 'Region' && value) {
    return { valid: true, intent: 'region_revenue', metric, dimension, value, region: value }
  }

  if (dimension?.field === 'Product' && /\b(which|top|best|most|highest)\b/i.test(cleaned)) {
    return { valid: true, intent: 'top_product', metric: metric || METRICS.revenue, dimension }
  }

  if (!metric && !dimension && cleaned.includes('profit')) {
    return {
      valid: false,
      error: 'Profit is not available in the imported data. Ask about revenue, orders, quantities, prices, discounts, products, categories, regions, channels, statuses, or dates.',
    }
  }

  if (!metric && !dimension) {
    return {
      valid: false,
      error: 'I could not identify a metric or field. Try asking about revenue, sales, orders, units, discounts, products, regions, categories, channels, or statuses.',
    }
  }

  if (ranking) return { valid: true, intent: ranking[1].match(/bottom|lowest|worst|smallest|minimum|min|least/i) ? 'bottom_group' : 'top_group', metric: metric || METRICS.revenue, dimension: dimension || DIMENSIONS.product, limit: extractLimit(cleaned) }
  if (list) return { valid: true, intent: 'breakdown', metric: metric || METRICS.revenue, dimension: dimension || DIMENSIONS.region }
  if (average) return { valid: true, intent: 'average', metric: metric || METRICS.revenue, dimension, value }
  if (total || metric) return { valid: true, intent: 'aggregate', metric: metric || METRICS.revenue, dimension, value }

  return { valid: false, error: 'I understood the question, but I need a metric such as revenue, orders, units, discounts, or price.' }
}

const findMetric = (text) => {
  for (const [metric, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.some((alias) => text.includes(alias))) return METRICS[metric]
  }

  return null
}

const findDimension = (text) => {
  const aliases = Object.keys(DIMENSIONS).sort((a, b) => b.length - a.length)
  const alias = aliases.find((item) => new RegExp(`\\b${item}s?\\b`, 'i').test(text))
  if (alias) return DIMENSIONS[alias]

  if (/\b(completed|cancelled|canceled|pending|returned|refunded)\b/i.test(text)) {
    return DIMENSIONS.status
  }

  return alias ? DIMENSIONS[alias] : null
}

const findDimensionValue = (raw, dimension, records) => {
  if (!dimension || dimension.field === 'Order_date') return null
  const knownValues = dimension.field === 'Region' ? ['North', 'South', 'East', 'West'] : []
  const values = [...uniqueValues(records, dimension.field), ...knownValues]
  return values.find((item) => normalizeText(raw).includes(normalizeText(item))) || null
}

const findDimensionValues = (raw, dimension, records) => {
  if (!dimension || dimension.field === 'Order_date') return []
  const knownValues = dimension.field === 'Region' ? ['North', 'South', 'East', 'West'] : []
  const values = [...new Set([...uniqueValues(records, dimension.field), ...knownValues])]
  return values.filter((item) => normalizeText(raw).includes(normalizeText(item)))
}

const extractLimit = (text) => {
  const match = text.match(/\b(?:top|bottom)\s+(\d+)\b/i)
  return match ? Math.min(Number(match[1]), 20) : 1
}

const filterRecords = (records, dimension, value) => {
  if (!dimension || !value) return records
  return records.filter((row) => normalizeText(row[dimension.field]) === normalizeText(value))
}

const aggregate = (records, metric) => {
  if (metric.count) return records.length
  return records.reduce((sum, row) => sum + safeNumber(row[metric.field]), 0)
}

const grouped = (records, dimension, metric) => {
  const groups = {}
  records.forEach((row) => {
    const key = row[dimension.field] || 'Unknown'
    groups[key] = (groups[key] || 0) + aggregate([row], metric)
  })
  return Object.entries(groups).sort((a, b) => b[1] - a[1])
}

const processQuestion = (question, records = []) => {
  const parsed = parseQuestion(question, records)
  if (!parsed.valid) return { success: false, error: parsed.error, supportingFigures: [] }

  const metric = parsed.metric
  const scopedRecords = filterRecords(records, parsed.dimension, parsed.value)
  const total = aggregate(scopedRecords, metric)
  const metricValue = (value) => metric.currency ? formatCurrency(value) : formatNumber(value)
  const scopeText = parsed.value ? ` for ${parsed.dimension.label} ${parsed.value}` : ''

  if (parsed.intent === 'aggregate' || parsed.intent === 'total_revenue' || parsed.intent === 'region_revenue') {
    return {
      success: true,
      answer: `${capitalize(metric.label)} is ${metricValue(total)}${scopeText}, across ${scopedRecords.length} records.`,
      supportingFigures: [
        { label: capitalize(metric.label), value: total },
        { label: 'Records', value: scopedRecords.length },
        { label: 'Data coverage', value: `${records.length ? Math.round((scopedRecords.length / records.length) * 100) : 0}%` },
      ],
    }
  }

  if (parsed.intent === 'average') {
    const average = scopedRecords.length ? total / scopedRecords.length : 0
    return {
      success: true,
      answer: `Average ${metric.label} is ${metricValue(average)}${scopeText}.`,
      supportingFigures: [
        { label: `Average ${metric.label}`, value: average },
        { label: 'Records', value: scopedRecords.length },
      ],
    }
  }

  if (parsed.intent === 'breakdown') {
    const results = grouped(scopedRecords, parsed.dimension, metric)
    return {
      success: true,
      answer: `${capitalize(metric.label)} by ${parsed.dimension.label}: ${results.slice(0, 5).map(([name, value]) => `${name} (${metricValue(value)})`).join(', ') || 'No matching data.'}.`,
      supportingFigures: results.slice(0, 8).map(([name, value]) => ({ label: name, value })),
    }
  }

  if (parsed.intent === 'top_group' || parsed.intent === 'bottom_group' || parsed.intent === 'top_product') {
    const results = grouped(scopedRecords, parsed.dimension, metric)
    const ordered = parsed.intent === 'bottom_group' ? results.reverse() : results
    const selected = ordered.slice(0, parsed.limit)
    return {
      success: true,
      answer: `${parsed.intent === 'bottom_group' ? 'Bottom' : 'Top'} ${parsed.dimension.label}${selected.length > 1 ? 's' : ''}: ${selected.map(([name, value]) => `${name} (${metricValue(value)})`).join(', ') || 'No matching data.'}.`,
      supportingFigures: selected.map(([name, value]) => ({ label: name, value })),
    }
  }

  if (parsed.intent === 'comparison') {
    const results = grouped(records, parsed.dimension, metric)
    const requestedValues = parsed.values?.length ? parsed.values : parsed.value ? [parsed.value] : []
    const first = requestedValues[0]
      ? results.find(([name]) => normalizeText(name) === normalizeText(requestedValues[0]))
      : results[0]
    const second = requestedValues[1]
      ? results.find(([name]) => normalizeText(name) === normalizeText(requestedValues[1]))
      : results.find(([name]) => name !== first?.[0])
    const difference = (first?.[1] || 0) - (second?.[1] || 0)
    return {
      success: true,
      answer: `${first?.[0] || 'First group'} has ${metricValue(first?.[1] || 0)} versus ${second?.[0] || 'the next group'} at ${metricValue(second?.[1] || 0)}; the difference is ${metricValue(Math.abs(difference))}.`,
      supportingFigures: [
        { label: first?.[0] || 'First group', value: first?.[1] || 0 },
        { label: second?.[0] || 'Second group', value: second?.[1] || 0 },
        { label: 'Difference', value: Math.abs(difference) },
      ],
    }
  }

  return { success: false, error: 'Unable to calculate an answer from the available data.', supportingFigures: [] }
}

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1)
const formatNumber = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0))
const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0))

export { parseQuestion, processQuestion }
