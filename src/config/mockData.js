// Mock data for development - replace with real database in production

export const mockUsers = [
  {
    id: 'demo_user_1',
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User',
    role: 'user',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'admin_user_1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    createdAt: '2024-01-01T00:00:00Z'
  }
];

export const mockDocuments = [
  {
    id: 'doc_1',
    user_id: 'demo_user_1',
    title: 'Sample Document',
    description: 'A sample document for testing',
    original_filename: 'sample.pdf',
    file_size: 1024000,
    mime_type: 'application/pdf',
    start_time: '2024-01-01T00:00:00Z',
    end_time: '2024-12-31T23:59:59Z',
    document_status: 'active',
    created_at: '2024-01-15T10:30:00Z',
    s3_image_url: 'https://example.com/sample.png',
    s3_key: 'documents/demo_user_1/sample.png'
  }
];

export const mockAccessLogs = [
  {
    id: 'log_1',
    document_id: 'doc_1',
    user_id: 'demo_user_1',
    access_time: '2024-01-20T14:22:00Z',
    access_method: 'download',
    success: true
  }
];

export const findUserByEmail = (email) => {
  return mockUsers.find(user => user.email === email);
};

export const findUserById = (id) => {
  return mockUsers.find(user => user.id === id);
};

export const createUser = (userData) => {
  const newUser = {
    id: `user_${Date.now()}`,
    ...userData,
    createdAt: new Date().toISOString()
  };
  mockUsers.push(newUser);
  return newUser;
};

export const getUserDocuments = (userId, filters = {}) => {
  return mockDocuments.filter(doc => doc.user_id === userId);
};

export const getDocumentById = (documentId) => {
  return mockDocuments.find(doc => doc.id === documentId);
};

export const getDocumentAccessLogs = (documentId) => {
  return mockAccessLogs.filter(log => log.document_id === documentId);
};