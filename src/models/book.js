export default {
  getAll: (db) => db.data.books,
  
  getById: (db, id) => db.data.books.find(b => b.id === id),
  
  create: async (db, book) => {
    const newBook = { 
      id: Date.now().toString(), 
      ...book,
      createdAt: new Date().toISOString()
    }
    
    db.data.books.push(newBook)
    await db.write()
    return newBook
  },
  
  update: async (db, id, updates) => {
    const index = db.data.books.findIndex(b => b.id === id)
    if (index === -1) return null
    
    const updatedBook = { 
      ...db.data.books[index], 
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    db.data.books[index] = updatedBook
    await db.write()
    return updatedBook
  },
  
  delete: async (db, id) => {
    const initialLength = db.data.books.length
    db.data.books = db.data.books.filter(b => b.id !== id)
    
    if (db.data.books.length === initialLength) {
      return false
    }
    
    await db.write()
    return true
  }
}
