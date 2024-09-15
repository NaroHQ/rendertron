# Build Environment: Node + Playwright
FROM node:fermium-slim

# Install build tools and additional dependencies
RUN apt-get update && apt-get install -y \
  build-essential \
  python3 \
  libtool \
  autoconf \
  automake \
  g++ \
  libssl-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Env
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

# Export port 3000 for Node
EXPOSE 3000

# Copy all app files into Docker Work directory
COPY package*.json /app/
COPY src/ /app/src/
COPY tsconfig.json /app/

# Install Deps
RUN npm install

# Install Playwright
RUN npx playwright install chromium

# Build TS into JS to run via Node
RUN npm run build

# Run Node index.js file
CMD [ "npm", "start" ]