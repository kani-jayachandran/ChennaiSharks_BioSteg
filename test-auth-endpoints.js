// Simple test script to verify auth endpoints
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function testAuthEndpoints() {
  console.log('🧪 Testing BioSteg-Locker Auth Endpoints...\n');

  // Test 1: Health Check
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health Check:', data.status);
  } catch (error) {
    console.log('❌ Health Check Failed:', error.message);
    return;
  }

  // Test 2: Registration
  try {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User'
      })
    });
    const data = await response.json();
    console.log('✅ Registration:', response.status, data.message);
  } catch (error) {
    console.log('❌ Registration Failed:', error.message);
  }

  // Test 3: Login with Demo Credentials
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@example.com',
        password: 'demo123'
      })
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Login:', response.status, data.message);
      console.log('   Token received:', data.token ? 'Yes' : 'No');
      
      // Test 4: Profile with Token
      try {
        const profileResponse = await fetch(`${BASE_URL}/api/auth/profile`, {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });
        const profileData = await profileResponse.json();
        console.log('✅ Profile:', profileResponse.status, profileData.user?.email);
      } catch (error) {
        console.log('❌ Profile Failed:', error.message);
      }
    } else {
      console.log('❌ Login Failed:', response.status, data.error);
    }
  } catch (error) {
    console.log('❌ Login Failed:', error.message);
  }

  console.log('\n🏁 Test Complete');
}

testAuthEndpoints();