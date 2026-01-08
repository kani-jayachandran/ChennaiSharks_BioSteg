# Backend Dockerfile
FROM node:18-alpine

# Install Python and OpenCV dependencies
RUN apk add --no-cache python3 py3-pip python3-dev build-base \
    && pip3 install opencv-python numpy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p temp models src/python

# Expose port
EXPOSE 3001

# Start development server
CMD ["npm", "run", "dev"]