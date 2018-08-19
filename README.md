# Sentinel
Facial recognition system in the browser. Train, detect, and edit classes.

All lib credits go to Vincent Mühler and his amazing [face-api.js](https://github.com/justadudewhohacks/face-api.js)

Demo: https://beatobongco.com/sentinel/



## Instructions

First, allow the system to use your webcam. Then wait for the system to load. You should see yourself on your webcam when fully loaded!

This system uses your webcam to detect faces. The data is stored in your browser and is not accessible to me or other third parties. So go bonkers with this demo!

Next is a brief explanation of the tabs...

## Training tab

Training allows you to add your face to the system. Fill in the text input with your or your friend's name, choose how many pictures you want the system to take (1-5 is fine, it wont take pictures that are too similar) and press "Train class".

The small box on the lower left section of the video feed is the "picture" the system sees.

Note that while the system can detect multiple faces at once, you must train for each face separately for it to run properly.

## Detection tab

Detection means identifying faces and checking if they are similar to the faces stored in its memory. The smaller the number beside the name, the close the match. If an unknown face is detected, it will save that face to the database which you can rename later on.

To identify between known and unknown classes, the system uses simple Euclidean distance between face embeddings.

The system can detect in "Single shot" and "Real-time" modes and can detect multiple faces at once.

* Single shot - the system will pause the video feed upon the first detection of a face/faces. Ideal for machines with poor hardware like phones.
* Real-time - the system will continually detect faces and add them to memory if it doesn't know them.

## Edit/Delete classes tab
A simple utility where one can delete stored faces or edit their names.

## Next steps

This uses a pretrained MTCNN for quick face detection on most hardware. In the future I'd like to provide a selection input so users can pick betwee different networks (e.g. more accurate but slower networks or vice versa).

I would also love to implement a blur filter since currently the system misidentifies known classes if you move too quickly. Ignoring people with too high a blur score could increase the system's utility.
