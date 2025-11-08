const PRISONERS_SERVICE_API_URL = import.meta.env.VITE_PRISONERS_SERVICE_API_URL || 'https://wasl-prisoner-service-production.up.railway.app';

export async function getPrisonerById(prisonerId) {
  try {
    console.log("api URL: ",PRISONERS_SERVICE_API_URL)
    const response = await fetch(`${PRISONERS_SERVICE_API_URL}/api/prisoners/${prisonerId}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch prisoner');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error fetching prisoner:', error);
    throw error;
  }
}

export async function getEnrolledFaces() {
  try {
    const response = await fetch(`${PRISONERS_SERVICE_API_URL}/api/prisoners/enrolled-faces`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch enrolled faces');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error fetching enrolled faces:', error);
    throw error;
  }
}

