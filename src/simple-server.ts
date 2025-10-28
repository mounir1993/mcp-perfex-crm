#!/usr/bin/env node

import express from 'express';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Simple health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Hello World!' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Simple HTTP Server running on port ${PORT}`);
  console.log(`🚀 Simple HTTP Server running on port ${PORT}`);
});