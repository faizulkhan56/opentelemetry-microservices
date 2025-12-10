#!/bin/bash

# Wait for MongoDB to start
until mongosh --eval "db.adminCommand('ping')" 2>/dev/null; do
  echo "Waiting for MongoDB to start..."
  sleep 2
done

# Initialize the replica set (only if not already initialized)
mongosh --eval "
  try {
    if (rs.status().ok === 0) {
      rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] });
    }
  } catch (e) {
    rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] });
  }
"