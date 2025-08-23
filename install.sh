#!/bin/bash

echo "========================================"
echo "   FaxSign Installation Script"
echo "========================================"
echo

echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Then run this script again."
    exit 1
fi

echo "Node.js is installed: $(node --version)"
echo

echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies!"
    exit 1
fi

echo
echo "========================================"
echo "   Installation Complete!"
echo "========================================"
echo
echo "To start the application, run: npm start"
echo
echo "The application will be available at:"
echo "http://localhost:3000"
echo
echo "Default login credentials:"
echo "Username: admin"
echo "Password: admin123"
echo

