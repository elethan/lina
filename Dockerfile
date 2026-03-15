FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Install python and build tools to compile better-sqlite3 native bindings on Alpine
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TanStack Start application for production
RUN npm run build

# Create a directory specifically for the SQLite database
# Change ownership to the built-in non-root 'node' user for security
RUN mkdir -p /app/shared-lina-db-vol && chown -R node:node /app/shared-lina-db-vol

# Declare the volume to document that it expects a mounted external volume
VOLUME ["/app/shared-lina-db-vol"]

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# WARNING: You must configure your Drizzle/SQLite client (e.g., in src/db/client.ts) 
# to read the database path from an environment variable like process.env.DB_PATH
ENV DB_PATH=/app/shared-lina-db-vol/lina_prod.db

# Switch to the non-root user
USER node

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
