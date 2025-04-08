const mongoose = require('mongoose')
const schema = mongoose.Schema(
    {
        username : {
            type : String,
            required : true
        },
        password : {
            type : String,
            required : true
        }
    }
)

var adminModel = mongoose.model("admin",schema)
module.exports = adminModel