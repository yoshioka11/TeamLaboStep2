var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var post = require('./routes/post')
var mongoose = require('mongoose');
var date = require('date-utils');
var connection = mongoose.connect('mongodb://localhost/todoList');
//DBのlistIDでauto incrementを使いたいので定義
var autoIncrement = require("mongoose-auto-increment");

autoIncrement.initialize(connection);

var app = express();

// view engine setup
app.set('views',__dirname + '/views');
app.set('view engine','ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


//内容スキーマ設計(チェック,内容,作成日,期限)
var Schema = mongoose.Schema;
var todoSchema = new Schema({
  isCheck     : {type: Boolean, default: false},
  content     : String,
  createdDate : {type: Date, default: Date.now},
  limitDate   : Date,
  listId      : {type: Number},
  title       : String
});
todoSchema.plugin(autoIncrement.plugin, {model:'Todo',field:'todoId'});
mongoose.model('Todo', todoSchema);
//一覧スキーマの設計(listID,タイトル,リスト内todoの合計,リスト内チェックされたtodoの合計)
var listSchema = new Schema({
  title     : String,
  sum       : {type: Number},
  checkSum  : {type: Number},
  lastUpDate :{type: Date},
  most      : Date,
  createdDate : {type: Date, default: Date.now}
});
//Listスキーマの中でlistIdをオートインクリメントにするためのコード↓
listSchema.plugin(autoIncrement.plugin, {model:'List',field:'listId'});
mongoose.model('List',listSchema);
var List = mongoose.model('List');
var Todo = mongoose.model('Todo');

//最後にtodoが作成された順に表示するためのsort
app.get('/lists',function(req,res){
  List.find({},null,{sort:{lastUpDate: -1}},function(err,lists){
    res.send(lists);
   });
   console.log('test');
  });

//getアクセスした時のrouting
app.get('/',post.index);


app.get('/search',post.searchTodo);


//postでbListのリクエストが来た時にデータベースに各データを挿入するためのコード
app.post('/addList',function(req,res){
  var title = req.body.name;
  if(title){
    var list = new List();
    list.title = title;
    list.sum = 0;
    list.checkSum = 0;
    list.save();
    res.send(true);
  }else{
    res.send(false);
  }
});
//get/todo/idで来た時にpost.showを実行する(idは数字じゃない場合エスケープするようにしてある)
app.get('/todo/id=:id([0-9]+)',post.show);

//todosにgetアクセスした時にqueryに含まれているidで指定したデータだけ返す。
app.get('/todos',function(req,res){
    var listId = req.query.ids;
    Todo.find({listId: listId},function(err,todos){
    res.send(todos);
  });

});
//addTodoにpostアクセスした時にToDoスキーマにデータをinsert
app.post('/addTodo',function(req,res,next){
  var content = req.body.content;
  var listId = req.body.listId;
  var limit = req.body.limit;
  var todo = new Todo();
  var checkA = 0;
  var checkB = 0;
  console.log('{limit:'+limit+',listId:'+listId+',content:'+content+'}');
  if(content && listId && limit){
    
      todo.content = content;
      todo.limitDate = limit;
      todo.listId = listId;


      //todoが空でもtitleが取得出来るようにとTop画面で直近の期限を表示出来るように
      List.find({listId:listId},function(err,up){
      todo.title = up[0].title;
      });
      todo.title;
      todo.save();

      Todo.find({listId:listId},function(err,up){
        if(up.length>0){
        checkA = up[0].limitDate;
        if(up.length>1){
        checkB = up[1].limitDate;
      }
        checkA = new Date(checkA);
        checkB = new Date(checkB);
        for(var i=0;i<up.length;i++){
          if(up[i].isCheck == false){
            checkA = up[i].limitDate;
            checkA = new Date(checkA);
            if(checkA<checkB){
              checkB = checkA;
            }
          }
        }
    }
});
//期限
      List.find({listId:listId},function(err,up){
        var limitDate = new Date(limit);
        console.log("limitDate="+limitDate);
        console.log("limit="+limit);
        console.log("ce"+checkB);
        if(checkB > limitDate){
          List.update({listId:listId},{most:limitDate},{upsert:true},function(err){
          });
      }else{
        List.update({listId:listId},{most:checkB},{upsert:true},function(err){
        });
      }
      });
      res.send(true);
  //todoが追加された時にlistの合計値を更新する。
  Todo.find({listId:listId},function(err,todoSum){
    if(todoSum.length > 0){
  var sums = todoSum.length + 1;


  //最終更新日の取得
  var newCreate = todoSum[todoSum.length-1].createdDate;
  newCreate= new Date(newCreate);

  //chcke数の取得
  var checkSum = 0;
  for(var i=0;i<todoSum.length;i++){
    if(todoSum[i].isCheck === true){
      checkSum++;
    }
  }
  //取得した合計と作成日のUpdate
   List.update({listId:listId},{$set:{sum:sums,lastUpDate:newCreate,checkSum:checkSum}},function (err){
   });

 }else{
   //初回投稿時のみデータを手動で挿入。
   var now = new Date();
    List.update({listId:listId},{$set:{sum:1,lastUpDate:now,most:limit}},function (err){
    });

 }
  });
  }else{
    res.send(false);
  }
});


app.post('/update',function(req,res){


//checkboxにチェックが入った時にfalseからtrueにupdateする。
  var checkDate = req.body.checked;

  // console.log('fuck!');
  // console.log(checkDate);
  for(var i=0;i<checkDate.length;i++){
  Todo.update({todoId:checkDate[i]},{$set:{isCheck:true}},function(err){
});
}
//チェックされた数を更新する。押されたタイミングでは0で挿入されてしまうので、初期値を１に設定。
  var listId = req.body.listId;
  Todo.find({listId:listId},function(err,checks){
    var checkSum = 0;
    for(var i=0;i<checks.length;i++){
      if(checks[i].isCheck === true){
        checkSum++;
      }
    }
     List.update({listId:listId},{$set:{checkSum:checkSum}},function (err){
     });
  });

});

app.post('/change',function(req,res){
//checkboxにチェックがはずれたときににtrueからfalseにupdateする。
  var checkDate = req.body.checked;
  // console.log('fuck!');
  // console.log(checkDate);
  for(var i=0;i<checkDate.length;i++){
  Todo.update({todoId:checkDate[i]},{$set:{isCheck:false}},function(err){
});
}
//チェックされた数を更新する。
  var listId = req.body.listId;
  Todo.find({listId:listId},function(err,checks){
    var checkSum = 0;
    for(var i=0;i<checks.length;i++){
      if(checks[i].isCheck === true){
        checkSum++;
      }
    }
     List.update({listId:listId},{$set:{checkSum:checkSum}},function (err){
     });
  });

});

//Listの検索
app.get('/searchList',function(req,res){
  var contents = req.query.contents;
  var List = mongoose.model('List');
  //new RegExp(contents)これで正規表現での文字列検索　部分一致で検索に引っかかるように変更
  List.find({title:new RegExp(contents)},null,{sort:{createdDate:-1}},function(err,resultList){
    res.send(resultList);
  });
});
//todoの検索
app.get('/searchTodo',function(req,res){
  var contents = req.query.contents;
  Todo.find({content:new RegExp(contents)},null,{sort:{createdDate:-1}},function(err,resultTodo){
    res.send(resultTodo);
  });
});

//showでのtitleの取得
app.post('/getTitle',function(req,res){
  var ids = req.body.title;
  List.find({listId:ids},function(err,title){
    res.send(title);
  });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;