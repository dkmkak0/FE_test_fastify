import fetch from 'node-fetch';
import FormData from 'form-data';

const API_URL = 'http://localhost:8080/api';
let authToken = null;
let testBookId = null;

// Hàm helper để gọi API
async function callApi(endpoint, method = 'GET', body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error('API Error:', error);
    return { status: 500, data: { error: error.message } };
  }
}

// Test đăng ký
async function testRegister() {
  console.log('\n=== Test Đăng ký ===');
  const username = `testuser_${Date.now()}`;
  const result = await callApi('/register', 'POST', {
    username,
    password: 'password123'
  });
  console.log('Status:', result.status);
  console.log('Response:', result.data);
  return result.data;
}

// Test đăng nhập
async function testLogin(username, password) {
  console.log('\n=== Test Đăng nhập ===');
  const result = await callApi('/login', 'POST', {
    username,
    password
  });
  console.log('Status:', result.status);
  console.log('Response:', result.data);
  if (result.data.token) {
    authToken = result.data.token;
  }
  return result.data;
}

// Test lấy danh sách sách
async function testGetBooks() {
  console.log('\n=== Test Lấy danh sách sách ===');
  
  // Test trang đầu tiên
  const result = await callApi('/books?page=1&limit=5', 'GET');
  console.log('Status:', result.status);
  
  if (result.status === 200 && result.data) {
    console.log('\nTrang 1:');
    console.log('- Số lượng sách:', result.data.data?.length || 0);
    console.log('- Tổng số sách:', result.data.pagination?.total || 0);
    console.log('- Tổng số trang:', result.data.pagination?.totalPages || 0);
    console.log('- Có trang tiếp theo:', result.data.pagination?.hasNextPage || false);
    console.log('- Trang tiếp theo:', result.data.pagination?.nextPage || null);
    
    // Test trang thứ 2 nếu có
    if (result.data.pagination?.hasNextPage) {
      const page2 = await callApi(`/books?page=2&limit=5`, 'GET');
      console.log('\nTrang 2:');
      console.log('- Số lượng sách:', page2.data.data?.length || 0);
      console.log('- Có trang trước:', page2.data.pagination?.hasPrevPage || false);
      console.log('- Trang trước:', page2.data.pagination?.prevPage || null);
      
      // Test trang cuối
      const lastPage = await callApi(`/books?page=${result.data.pagination.totalPages}&limit=5`, 'GET');
      console.log('\nTrang cuối:');
      console.log('- Số lượng sách:', lastPage.data.data?.length || 0);
      console.log('- Có trang tiếp theo:', lastPage.data.pagination?.hasNextPage || false);
    }
  } else {
    console.log('Lỗi khi lấy danh sách sách:', result.data);
  }
  
  return result.data;
}

// Test tìm kiếm sách
async function testSearchBooks() {
  console.log('\n=== Test Tìm kiếm sách ===');
  const result = await callApi('/books?title=test');
  console.log('Status:', result.status);
  console.log('Kết quả tìm kiếm:', result.data);
  return result.data;
}

// Test thêm sách mới
async function testCreateBook() {
  console.log('\n=== Test Thêm sách mới ===');
  
  // Tạo FormData
  const formData = new FormData();
  formData.append('title', 'Test Book');
  formData.append('author', 'Test Author');
  formData.append('year', '2024');
  formData.append('description', 'This is a test book');

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      ...formData.getHeaders()
    },
    body: formData
  };

  try {
    const response = await fetch(`${API_URL}/books`, options);
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Sách mới:', data);
    if (data.id) {
      testBookId = data.id;
    }
    return data;
  } catch (error) {
    console.error('API Error:', error);
    return { status: 500, data: { error: error.message } };
  }
}

// Test lấy chi tiết sách
async function testGetBookDetail() {
  if (!testBookId) {
    console.log('Không có ID sách để test');
    return;
  }
  console.log('\n=== Test Lấy chi tiết sách ===');
  const result = await callApi(`/books/${testBookId}`);
  console.log('Status:', result.status);
  console.log('Chi tiết sách:', result.data);
  return result.data;
}

// Test cập nhật sách
async function testUpdateBook() {
  if (!testBookId) {
    console.log('Không có ID sách để test');
    return;
  }
  console.log('\n=== Test Cập nhật sách ===');

  // Tạo FormData
  const formData = new FormData();
  formData.append('title', 'Updated Test Book');
  formData.append('author', 'Updated Test Author');
  formData.append('year', '2024');
  formData.append('description', 'This is an updated test book');

  const options = {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      ...formData.getHeaders()
    },
    body: formData
  };

  try {
    const response = await fetch(`${API_URL}/books/${testBookId}`, options);
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Sách sau khi cập nhật:', data);
    return data;
  } catch (error) {
    console.error('API Error:', error);
    return { status: 500, data: { error: error.message } };
  }
}

// Test lấy thông tin người dùng
async function testGetUserInfo() {
  console.log('\n=== Test Lấy thông tin người dùng ===');
  const result = await callApi('/me', 'GET', null, authToken);
  console.log('Status:', result.status);
  console.log('Thông tin người dùng:', result.data);
  return result.data;
}

// Test lấy lịch sử xem
async function testGetViewHistory() {
  console.log('\n=== Test Lấy lịch sử xem ===');
  const result = await callApi('/view-history', 'GET', null, authToken);
  console.log('Status:', result.status);
  console.log('Lịch sử xem:', result.data);
  return result.data;
}

// Chạy tất cả các test
async function runAllTests() {
  try {
    // Test đăng ký và đăng nhập
    const registerResult = await testRegister();
    if (registerResult.error) {
      console.log('Đăng ký thất bại, thử đăng nhập với tài khoản test');
      await testLogin('testuser', 'password123');
    } else {
      await testLogin(registerResult.user.username, 'password123');
    }

    // Test các API sách
    await testGetBooks();
    await testSearchBooks();
    await testCreateBook();
    await testGetBookDetail();
    await testUpdateBook();

    // Test các API người dùng
    await testGetUserInfo();
    await testGetViewHistory();

    console.log('\n=== Tất cả test đã hoàn thành ===');
  } catch (error) {
    console.error('Lỗi khi chạy test:', error);
  }
}

// Chạy test
runAllTests(); 