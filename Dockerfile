FROM node:24-slim

WORKDIR /app

# Copy package files (wildcard ensures it works even if package-lock is omitted)
COPY package.json package-lock.json* ./

# Install production dependencies safely without strict lockfile failures
RUN npm install --omit=dev

# Copy application files
COPY . .

# Ensure data and storage directories exist
RUN mkdir -p data storage/invoices

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
