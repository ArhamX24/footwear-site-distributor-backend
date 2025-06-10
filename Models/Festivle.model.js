import mongoose from "mongoose";

let {model, Schema} = mongoose;

let FestiveSchema = new Schema({
    startDate: { 
      type: Date, 
      required: true 
    },
    endDate: { 
      type: Date, 
      required: true,
      index: { expires: 0 }
    },
    image: {type: String},
}, {timestamps: true})

let Festive = model('Festival', FestiveSchema);

export default Festive