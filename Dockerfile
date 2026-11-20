# Render builds this image remotely. No Docker installation on Windows is needed.
# Stage 1: build the Vite/React frontend.
FROM node:24-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
# A committed package-lock.json is strongly recommended; use npm ci when present.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build

# Stage 2: package React static files inside the Spring Boot executable JAR.
FROM maven:3.9.11-eclipse-temurin-21 AS backend-build
WORKDIR /backend
COPY backend/pom.xml ./pom.xml
COPY backend/src/ ./src/
COPY --from=frontend-build /frontend/dist/ ./src/main/resources/static/
RUN mvn -B -ntp -DskipTests package

# Stage 3: lightweight runtime with a known working font for PDFBox.
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-build /backend/target/institution-directory-1.0.0.jar /app/app.jar
ENV PORT=10000
ENV PDF_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
EXPOSE 10000
USER 10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
