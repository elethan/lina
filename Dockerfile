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

# Create the SQLite database directory and give the non-root 'node' user
# ownership of the entire /app tree (build output, node_modules, db dir).
# Without this, vite preview runs as 'node' but can't read root-owned files.
RUN mkdir -p /app/shared-lina-db-vol \
    && chown -R node:node /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/shared-lina-db-vol/lina_prod.db

# Switch to the non-root user
USER node

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
