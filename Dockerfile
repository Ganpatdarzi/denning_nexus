# Build the SPA, then run the API and static client in one small Node image.
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server && npm ci --prefix client
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server/package*.json server/
RUN npm ci --omit=dev --prefix server
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/server/data/seed ./server/data/seed
COPY --from=build /app/server/scripts ./server/scripts
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data
EXPOSE 4000
CMD ["npm", "start"]
