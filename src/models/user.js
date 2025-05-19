import bcrypt from 'bcrypt'

export default {
  findByUsername: (db, username) => {
    return db.data.users.find(u => u.username === username)
  },
  
  create: async (db, userData) => {
    // Mã hóa password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(userData.password, salt)
    
    const newUser = {
      id: Date.now().toString(),
      username: userData.username,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    }
    
    db.data.users.push(newUser)
    await db.write()
    
    // Trả về user nhưng không bao gồm password
    const { password, ...userWithoutPassword } = newUser
    return userWithoutPassword
  },
  
  validatePassword: async (user, password) => {
    return await bcrypt.compare(password, user.password)
  }
}
