# Build Environment: Node + Playwright
FROM node:20
FROM mcr.microsoft.com/playwright:focal

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