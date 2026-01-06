# Use official Node.js image
FROM node:18

# Install cloudflared
RUN curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb \
    && dpkg -i cloudflared.deb \
    && rm cloudflared.deb

# Set working directory
WORKDIR /app

# Copy backend code
COPY . .

# Install dependencies
RUN npm install

# Optional: expose port (if needed)
EXPOSE 5000

# Start both backend and cloudflared tunnel
CMD cloudflared tunnel run my-mongo-tunnel & npm start