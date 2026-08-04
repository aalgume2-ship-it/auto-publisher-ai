export const apiClient = {
  async post(endpoint: string, body: any) {
    const url = process.env.NEXT_PUBLIC_API_URL 
      ? `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`
      : `http://localhost:3100/api${endpoint}`; // Proxy in dev
      
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API Request failed');
    }
    return res.json();
  }
};
