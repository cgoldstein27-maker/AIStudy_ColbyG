# Golf Simulator 3D

A professional 18-hole golf simulator game with 3D graphics, club selection, and interactive accuracy mechanics.

## How to Play

1. **Select a Club**: Choose from 14 different golf clubs (Driver to Putter) based on distance to the hole
2. **Power Meter**: Press SPACEBAR at the peak of the power meter to maximize distance
3. **Accuracy Game**: Click targets as quickly as possible (3 seconds) - the more targets you hit, the better your accuracy
4. **Complete the Hole**: Hit the ball until it reaches the green (within 5 meters of the pin)

## Features

- **18-hole championship course** with varying distances and par values
- **14 realistic golf clubs** with different characteristics
- **Two-stage swing system**: Power meter + target-based accuracy game
- **3D graphics** using Three.js with persistent ball position tracking
- **Intelligent club selection** - only shows appropriate clubs for current distance
- **Par tracking** with Eagles, Birdies, and score differential
- **Interactive course visualization** showing player, ball, and flag

## Running Locally

1. Ensure Python 3 is installed
2. Navigate to the golf-simulator folder: `cd golf-simulator`
3. Run `python3 -m http.server 8000`
4. Open `http://localhost:8000/index.html` in your browser

## Game Statistics

- Total holes: 18
- Total par: 72
- Distance range: 290m - 600m
- Available clubs: Driver, Woods (3, 5), Irons (3-9), Wedges (Pitching, Sand, Lob), Putter
