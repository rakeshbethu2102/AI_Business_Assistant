import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuestion, processQuestion } from '../src/utils/analyticsEngine.js'

test('parses total revenue question', () => {
  const result = parseQuestion('What is the total revenue?')
  assert.equal(result.intent, 'total_revenue')
  assert.equal(result.valid, true)
})

test('parses region revenue question', () => {
  const result = parseQuestion('What is the revenue in North region?')
  assert.equal(result.intent, 'region_revenue')
  assert.equal(result.region, 'North')
  assert.equal(result.valid, true)
})

test('parses top product question', () => {
  const result = parseQuestion('Which product sold the most?')
  assert.equal(result.intent, 'top_product')
  assert.equal(result.valid, true)
})

test('rejects destructive query', () => {
  const result = parseQuestion('Delete all records from the database')
  assert.equal(result.valid, false)
  assert.match(result.error, /unsupported|destructive/i)
})

test('handles edge case with empty question', () => {
  const result = parseQuestion('   ')
  assert.equal(result.valid, false)
  assert.match(result.error, /empty|question/i)
})

test('processes valid question and returns structured answer', () => {
  const answer = processQuestion('What is the total revenue?', [
    { Region: 'North', Product: 'Keyboard', Category: 'Accessories', Quantity: 10, Unit_price: 900, Discount_amount: 0, Revenue: 9000 },
    { Region: 'South', Product: 'Desk', Category: 'Furniture', Quantity: 3, Unit_price: 12500, Discount_amount: 0, Revenue: 37500 },
  ])

  assert.equal(answer.success, true)
  assert.equal(answer.answer.includes('Revenue'), true)
  assert.ok(answer.supportingFigures.length >= 1)
})

const sampleRecords = [
  { Region: 'North', Product: 'Keyboard', Category: 'Accessories', Sales_channel: 'Online', Status: 'Completed', Quantity: 10, Unit_price: 900, Discount_amount: 0, Revenue: 9000 },
  { Region: 'South', Product: 'Desk', Category: 'Furniture', Sales_channel: 'Retail', Status: 'Completed', Quantity: 3, Unit_price: 12500, Discount_amount: 0, Revenue: 37500 },
  { Region: 'North', Product: 'Desk', Category: 'Furniture', Sales_channel: 'Online', Status: 'Completed', Quantity: 2, Unit_price: 10000, Discount_amount: 0, Revenue: 20000 },
]

test('understands alternate revenue wording', () => {
  const result = processQuestion('How much did we make overall?', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /Revenue is \$66,500/)
})

test('returns a grouped breakdown', () => {
  const result = processQuestion('Show me revenue by category', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /Furniture/)
  assert.equal(result.supportingFigures[0].label, 'Furniture')
})

test('answers ranking questions with a requested limit', () => {
  const result = processQuestion('What are the top 2 products by sales?', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /Desk/)
  assert.equal(result.supportingFigures.length, 2)
})

test('answers comparison questions', () => {
  const result = processQuestion('Compare North and South regions by revenue', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /difference/i)
  assert.match(result.answer, /North.*South/)
})

test('labels top product rankings correctly', () => {
  const result = processQuestion('Which product sold the most?', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /^Top product/)
})

test('answers status questions from imported fields', () => {
  const result = processQuestion('How many completed orders are there?', [
    ...sampleRecords,
    { ...sampleRecords[0], Transaction_Id: 'TXN4', Status: 'Cancelled' },
    { ...sampleRecords[1], Transaction_Id: 'TXN5', Status: 'Completed' },
  ])
  assert.equal(result.success, true)
  assert.equal(result.supportingFigures[1].value, 4)
})

test('rejects unsupported questions without inventing results', () => {
  const result = processQuestion('What will revenue be next year?', sampleRecords)
  assert.equal(result.success, false)
  assert.match(result.error, /metric|field|calculate/i)
})

test('understands common business aliases', () => {
  assert.equal(processQuestion('What is the total amount?', sampleRecords).success, true)
  assert.equal(processQuestion('How many items did we sell?', sampleRecords).success, true)
  assert.equal(processQuestion('What is the number of orders?', sampleRecords).success, true)
  assert.equal(processQuestion('How many completed orders do we have?', sampleRecords).success, true)
})

test('understands average order value', () => {
  const result = processQuestion('What is the average order value?', sampleRecords)
  assert.equal(result.success, true)
  assert.match(result.answer, /Average revenue is \$22,167/)
})
