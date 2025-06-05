#!/bin/bash
cd /home/kavia/workspace/code-generation/synthwave-space-shooter-28084-a84576a4/synthwave_space_shooter
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

