#!/bin/bash

# Wait for MongoDB to be ready
until mongosh --eval "db.adminCommand('ping')" 2>/dev/null; do
  echo "Waiting for MongoDB to start..."
  sleep 2
done

# Initialize replica set if not already initialized
mongosh --eval "
  try {
    var status = rs.status();
    print('Replica set already initialized');
  } catch (e) {
    if (e.message.includes('no replset config has been received')) {
      print('Initializing replica set...');
      rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] });
      print('Replica set initialized');
    } else {
      print('Error checking replica set status:', e.message);
    }
  }
"

