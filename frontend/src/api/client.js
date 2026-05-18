import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const getStocks       = (params) => api.get('/stocks', { params }).then((r) => r.data);
export const getStock        = (symbol) => api.get(`/stocks/${symbol}`).then((r) => r.data);
export const getStockHistory = (symbol, params) => api.get(`/stocks/${symbol}/history`, { params }).then((r) => r.data);
export const getSectors      = () => api.get('/stocks/sectors').then((r) => r.data);
export const addStock        = (body) => api.post('/stocks', body).then((r) => r.data);
export const refreshAll      = () => api.post('/stocks/refresh').then((r) => r.data);

export const getFavourites  = () => api.get('/favourites').then((r) => r.data);
export const addFavourite   = (symbol) => api.post(`/favourites/${symbol}`).then((r) => r.data);
export const removeFavourite = (symbol) => api.delete(`/favourites/${symbol}`).then((r) => r.data);

export const getConditions    = (symbol) => api.get('/conditions', { params: symbol ? { symbol } : {} }).then((r) => r.data);
export const createCondition  = (body) => api.post('/conditions', body).then((r) => r.data);
export const updateCondition  = (id, body) => api.put(`/conditions/${id}`, body).then((r) => r.data);
export const deleteCondition  = (id) => api.delete(`/conditions/${id}`).then((r) => r.data);

export const getAlerts      = (params) => api.get('/alerts', { params }).then((r) => r.data);
export const getAlertCount  = () => api.get('/alerts/count').then((r) => r.data);
export const dismissAlert   = (id) => api.post(`/alerts/${id}/dismiss`).then((r) => r.data);
export const dismissAll     = () => api.post('/alerts/dismiss-all').then((r) => r.data);

export const runBacktest = (body) => api.post('/backtest', body).then((r) => r.data);
