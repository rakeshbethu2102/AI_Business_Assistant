import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseQuestion, processQuestion } from '../utils/analyticsEngine.js'
import { getPool, isDatabaseConnected } from '../config/db.js'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const csvPath = path.join(__dirname, '..', '..', 'data', 'ai_bi_assistant_sales_data - GET.csv')

const loadSalesData = () => {
  const csvText = fs.readFileSync(csvPath, 'utf-8')
  return parseCSV(csvText)
    .map(normalizeRow)
    .filter((item) => item.Transaction_Id)
}

const parseCSV = (csvText) => {
  const rows = csvText.trim().split(/\r?\n/)
  const headers = rows[0].split(',')

  return rows.slice(1).filter(Boolean).map((row) => {
    const values = row.split(',')
    const obj = {}
    headers.forEach((header, idx) => {
      let value = values[idx] ?? ''
      if (value === '') value = null
      obj[header.trim()] = value
    })
    return obj
  })
}

const normalizeRow = (row) => {
  const quantity = Number(row.Quantity ?? 0)
  const unitPrice = Number(row.Unit_price ?? 0)
  const discount = Number(row.Discount_amount ?? 0)
  const revenue = (quantity * unitPrice) - discount

  return {
    ...row,
    Quantity: quantity,
    Unit_price: unitPrice,
    Discount_amount: discount,
    Revenue: revenue,
    Order_date: row.Order_date || null,
  }
}

const importRecords = async (records) => {
  if (!isDatabaseConnected()) {
    return null
  }

  const database = getPool()
  let inserted = 0
  let updated = 0

  for (const record of records) {
    const [result] = await database.query(`
      INSERT INTO sales_transactions
        (transaction_id, order_date, customer_id, product, category, region, sales_channel, status,
         quantity, unit_price, discount_amount, revenue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        order_date = VALUES(order_date), customer_id = VALUES(customer_id), product = VALUES(product),
        category = VALUES(category), region = VALUES(region), sales_channel = VALUES(sales_channel), status = VALUES(status),
        quantity = VALUES(quantity), unit_price = VALUES(unit_price),
        discount_amount = VALUES(discount_amount), revenue = VALUES(revenue)
    `, [record.Transaction_Id, record.Order_date, record.Customer_Id, record.Product, record.Category,
      record.Region, record.Sales_channel, record.Status, record.Quantity, record.Unit_price,
      record.Discount_amount, record.Revenue])

    if (result.affectedRows === 1) inserted += 1
    else updated += 1
  }

  return { inserted, updated }
}

const getSalesRecords = async () => {
  if (isDatabaseConnected()) {
    const [records] = await getPool().query(`
      SELECT
        transaction_id AS Transaction_Id,
        order_date AS Order_date,
        customer_id AS Customer_Id,
        product AS Product,
        category AS Category,
        region AS Region,
        sales_channel AS Sales_channel,
        status AS Status,
        quantity AS Quantity,
        unit_price AS Unit_price,
        discount_amount AS Discount_amount,
        revenue AS Revenue
      FROM sales_transactions
      ORDER BY id
    `)
    if (records.length) return records
  }

  return loadSalesData()
}

router.get('/sales', async (req, res) => {
  try {
    const records = await getSalesRecords()

    res.json({
      totalRecords: records.length,
      summary: {
        totalRevenue: records.reduce((sum, item) => sum + item.Revenue, 0),
        totalQuantity: records.reduce((sum, item) => sum + item.Quantity, 0),
        averageOrderValue: records.length
          ? records.reduce((sum, item) => sum + item.Revenue, 0) / records.length
          : 0,
      },
      regionPerformance: Object.entries(
        records.reduce((acc, item) => {
          acc[item.Region] = acc[item.Region] || { region: item.Region, revenue: 0, orders: 0 }
          acc[item.Region].revenue += item.Revenue
          acc[item.Region].orders += 1
          return acc
        }, {})
      ).map(([, value]) => value),
      categoryPerformance: Object.entries(
        records.reduce((acc, item) => {
          acc[item.Category] = acc[item.Category] || { category: item.Category, revenue: 0, orders: 0 }
          acc[item.Category].revenue += item.Revenue
          acc[item.Category].orders += 1
          return acc
        }, {})
      ).map(([, value]) => value),
      salesTrend: Object.entries(
        records.reduce((acc, item) => {
          const key = item.Order_date ? item.Order_date.slice(0, 5) : 'Unknown'
          acc[key] = acc[key] || { month: key, revenue: 0 }
          acc[key].revenue += item.Revenue
          return acc
        }, {})
      ).map(([, value]) => value),
      records,
    })
  } catch (error) {
    res.status(500).json({ message: 'Failed to read sales dataset', error: error.message })
  }
})

router.post('/ask', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim()

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a business question to analyze.',
      })
    }

    const records = await getSalesRecords()
    const result = processQuestion(question, records)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        supportingFigures: result.supportingFigures || [],
      })
    }

    return res.json({
      success: true,
      question,
      answer: result.answer,
      supportingFigures: result.supportingFigures,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to answer the analytics question.',
      details: error.message,
    })
  }
})

router.post('/import', async (req, res) => {
  try {
    const uploadedCsv = typeof req.body?.csv === 'string' ? req.body.csv : null
    const records = uploadedCsv
      ? parseCSV(uploadedCsv).map(normalizeRow).filter((item) => item.Transaction_Id)
      : loadSalesData()

    if (!isDatabaseConnected()) {
      return res.status(503).json({
        success: false,
        error: 'MySQL is not connected. Start MySQL before importing the CSV dataset.',
        totalRecords: records.length,
      })
    }

    const result = await importRecords(records)

    return res.json({
      success: true,
      totalImported: records.length,
      source: uploadedCsv ? 'upload' : 'configured-file',
      ...result,
      message: 'CSV dataset imported into MySQL successfully.',
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'CSV import failed.',
      details: error.message,
    })
  }
})

export default router
