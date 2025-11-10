import { model, Schema } from "mongoose";

const eventSchema = new Schema({
    data: { type: Date, required: true },
    local: { type: String, required: true },
    descrição: { type: String, required: true },
    fotos: [{ type: String }]
}, {
    timestamps: true
});

export const Event = model('Event', eventSchema);