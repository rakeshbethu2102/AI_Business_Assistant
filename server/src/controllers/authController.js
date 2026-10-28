import generateToken from '../utils/generateToken.js'
import bcrypt from 'bcryptjs'
import { getPool, isDatabaseConnected } from '../config/db.js'

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body

    if (!isDatabaseConnected()) {
      return res.status(503).json({ message: 'MySQL is not connected' })
    }

    const database = getPool()
    const [existingUsers] = await database.query('SELECT id FROM users WHERE email = ?', [email])

    if (existingUsers.length) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const [result] = await database.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    )
    const user = { id: result.insertId, name, email, role: 'user' }

    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id),
    })
  } catch (error) {
    next(error)
  }
}

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!isDatabaseConnected()) {
      return res.status(503).json({ message: 'MySQL is not connected' })
    }

    const database = getPool()
    const [users] = await database.query('SELECT * FROM users WHERE email = ?', [email])
    const user = users[0]

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user.id),
      })
    } else {
      res.status(401).json({ message: 'Invalid email or password' })
    }
  } catch (error) {
    next(error)
  }
}

const getMe = async (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  })
}

export { registerUser, loginUser, getMe }
