FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY src/ ./src/
COPY public/ ./public/

# Ensure storage and data directories exist
RUN mkdir -p data storage/invoices

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
