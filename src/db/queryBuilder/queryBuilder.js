const conf = require('./../../config/config');
const log = require('./../../log/logger');
const crypt = require('./../../common/encrypt');

const DOT = ".";
const SPACE = " ";
const SEMICOLON = ';';
/**
 * Query builder ; IF you update , check https://github.com/mysqljs/mysql for building effective and better queries
 * @param req
 * @param schema
 * @param conf
 */
function query(req, schema, conf) {
    this.req = req;
    if (this.req && this.req.body) {
        this.body = this.req.body;
        this.dbTable = this.body.table;
        this.dbSchema = this.body.schema;
        this.cols = this.body.attr;
    }
    this.schema = schema;
    if (!schema.properties.operation) {
        this.schemaCols = this.schema.properties.attr.properties;
    }
    this.conf = conf;
}

/**
 *  Encrypts value
 * @param conf SCHEMA_CONF
 * @param k CURRENT_KEY string value
 * @param rawValue RAW_VALUE non encrypted
 * @returns {*}
 */
query.prototype.getEncryptedValue = function (conf, k, rawValue, returnAutoGenerated) {
    var val = rawValue;
    if (contains(conf.hashed, k)) {
        val = crypt.hashText(rawValue + "");
    }

    if (contains(conf.encrypted, k)) {
        val = crypt.encryptText(rawValue + "");
    }

    if (contains(conf.dates, k)) {
        val = new Date(rawValue);
    }

    const blobConf = containsBlob(conf.blob, k);
    if (isValidObject(blobConf)) {
        if (blobConf.type == 'string') {
            val = new Buffer(val, 'utf8');
        }
    }
    // auto-generated like pk ids
    if (returnAutoGenerated && contains(conf.auto, k)) {
        val = rawValue;
    }
    return val;
};

query.prototype.hashValue = function (conf, k, rawValue) {
    if (contains(conf.hashed, k)) {
        return crypt.hashText(rawValue + "");
    }
    return rawValue;
};

query.prototype.decryptValues = function (results) {
    const conf = this.conf;
    for (l = 0; l < results.length; l++) {
        const obj = results[l];
        const keys = Object.keys(obj);
        for (m = 0; m < keys.length; m++) {
            const k = (keys[m]).toString();
            if (isValidObject(obj[k])) {
                const blobConf = containsBlob(conf.blob, k);
                if (isValidObject(blobConf) && blobConf.type == 'string') {
                    if (obj[k].type == 'Buffer') { // while caching at post we added via Json.String....which used buffer as it is
                        obj[k] = new Buffer(obj[k].data, 'utf8').toString();
                    } else {
                        obj[k] = obj[k].toString('utf8');
                    }
                }
                if (contains(conf.encrypted, k)) {
                    obj[k] = crypt.decryptText(obj[k]);
                }
            }
        }
    }
};


/**
 * Based on column mentioned in body and schema, method creates conditions and values array for help building query
 */
query.prototype.createConditionsAndValues = function () {
    const conditions = [];
    const values = [];
    const strColKeyArray = [];
    const schemaCols = this.schemaCols;
    const conf = this.conf;
    const colMap = buildMap(this.cols);
    const schemaColMap = buildMap(schemaCols);

    log.debug('cols= ' + JSON.stringify(this.cols) + '\t\tconf.hashed =' + JSON.stringify(conf.hashed) + '\t\tconf.encrypted = ' + JSON.stringify(conf.encrypted) +
        '\t\tconf.autoids = ' + JSON.stringify(conf.autoids) + '\t\tschemaCols = ' + JSON.stringify(schemaCols));

    const keys = Object.keys(this.cols);
    for (j = 0; j < keys.length; j++) {
        const k = keys[j].toString();
        const colValue = colMap.get(k) != null && colMap.get(k) != undefined ? colMap.get(k) : (schemaColMap.get(k).optional != null ? schemaColMap.get(k).optional != null : null);
        if (colValue) {
            conditions.push(k);
            values.push(this.getEncryptedValue(conf, k, colValue, false));
        }
    }
    return {"conditions": conditions, "values": values};
};
/**
 * Creates insert query
 * @returns {{where: string, values: Array}}
 */
query.prototype.insertQuery = function () {
    const conf = this.conf;
    var queryStr = 'INSERT INTO ' + this.dbSchema + DOT + this.dbTable + SPACE + '(';
    const q = this.createConditionsAndValues();
    log.debug('condition values from input ' + q);
    if (isValidObject(this.req.params.id) && !contains(conf.auto, conf.key) && !contains(q.conditions, conf.key)) {
        q.conditions.push(conf.key);
        q.values.push(this.req.params.id);
    }
    queryStr += q.conditions.join(',') + ')' + SPACE + 'values(';
    q.values.forEach(function (val) {
        queryStr += '?,';
    });
    queryStr = queryStr.substr(0, queryStr.length - 1) + ')';

    log.debug('query : ' + queryStr);
    return {
        "query": {
            sql: queryStr,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": q.values
    };
};

/**
 * Creates insert query
 * @returns {{where: string, values: Array}}
 */
query.prototype.updateQuery = function () {
    const conf = this.conf;
    const jsonData = this.req.body;
    const fields = jsonData.attr;
    var queryStr = 'UPDATE ' + this.dbSchema + DOT + this.dbTable + SPACE + 'SET' + SPACE;
    const actualFields = Object.keys(fields);
    validateFields('Update', isValidObject(conf.updateconf) ? conf.updateconf.fields : [], actualFields);
    const q = this.createConditionsAndValues();
    log.debug('condition values from input ' + q);
    queryStr += q.conditions.join('= ? , ');
    queryStr += SPACE + ' = ? WHERE' + SPACE + conf.key + ' = ?';
    q.values.push(this.req.params.id);
    return {
        "query": {
            sql: queryStr,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": q.values
    };
};

/**
 * Creates get query
 * @returns {{where: string, values: Array}}
 */
query.prototype.searchQuery = function () {
    const jsonData = this.req.body;
    const fields = jsonData.fields;
    const where = jsonData.where;
    const orderby = jsonData.orderby;
    const limit = jsonData.limit;
    const offset = jsonData.offset;
    const conf = this.conf;
    const values = [];

    const isOrderingRequired = orderby && conf.searchconf.orderby && orderby.order && conf.searchconf.orderby.order;
    const validateInput = validateFields('Search', conf.searchconf.fields, fields) && validateFields('Where', conf.searchconf.where, Object.keys(where))
        && ((isOrderingRequired) ? validateFields('OrderBy', conf.searchconf.orderby.order, orderby.order) : true);

    log.debug('Search validation =' + validateInput + '\nfields = ' + JSON.stringify(fields) + '\nwhere= ' + JSON.stringify(where) + '\norderby = '
        + JSON.stringify(orderby) + '\nlimit = ' + JSON.stringify(limit) + '\noffset = ' + offset);

    var queryStr = 'SELECT ' + SPACE + fields.join(',') + SPACE + 'FROM' + SPACE + this.dbSchema + DOT + this.dbTable + SPACE + 'WHERE' + SPACE;
    const keys = Object.keys(where);
    for (i = 0; i < keys.length; i++) {
        const k = keys[i];
        values.push(this.getEncryptedValue(conf, k.toString(), where[k], true));
    }

    queryStr = queryStr + keys.join(' = ? AND ') + ' = ? ' + SPACE;
    if (isOrderingRequired) {
        queryStr = queryStr + SPACE + 'ORDER BY' + SPACE + orderby.order.join(',') + SPACE + (orderby.by != null && orderby.by != undefined ? orderby.by : 'ASC') + SPACE;
    } else { // default ordering if any
        queryStr = queryStr + SPACE + ((conf.searchconf && conf.searchconf.orderby && conf.searchconf.orderby.deforder) ? (' ORDER BY' + SPACE + conf.searchconf.orderby.deforder ) : '');
    }

    queryStr = queryStr + SPACE + 'LIMIT' + SPACE + (  limit ? limit : 10) + SPACE;
    if (offset) {
        queryStr = queryStr + SPACE + 'OFFSET' + SPACE + offset + SPACE;
    }

    return {
        "query": {
            sql: queryStr,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": values
    };
};

/**
 * Find resource by ID
 * @param table
 * @param schema
 * @param id
 */
query.prototype.findById = function (table, schema, id) {
    const conf = this.conf;
    const q = {
        "query": {
            sql: 'SELECT ' + SPACE + conf.searchconf.fields.join(',') + SPACE + 'FROM' + SPACE + schema + '.' + table + SPACE + 'WHERE ' + conf.key + ' = ? ' + ((conf.searchconf && conf.searchconf.orderby && conf.searchconf.orderby.deforder) ? (' ORDER BY' + SPACE + conf.searchconf.orderby.deforder ) : ''),
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": [id]
    };
    return q;
};

/**
 * Find resource by ID
 * @param table
 * @param schema
 * @param id
 */
query.prototype.deleteById = function (table, schema, id) {
    return {
        "query": {
            sql: 'DELETE FROM ' + schema + '.' + table + SPACE + 'WHERE ' + this.conf.key + ' = ? ',
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": [id]
    };
};

/**
 * Get and delet...two queries, two values
 * @param table
 * @param schema
 * @param id
 * @returns {{query: string, values: [*]}}
 */
query.prototype.getanddelete = function (table, schema, id) {
    const getQuery = this.findById(table, schema, id);
    const deleteQuery = this.deleteById(table, schema, id);

    return {
        "query": {
            sql: getQuery.query.sql + SEMICOLON + deleteQuery.query.sql,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": [getQuery.values, deleteQuery.values]
    };
};

/**
 * Creates get query
 * @returns {{where: string, values: Array}}
 */
query.prototype.deleteQuery = function () {
    const jsonData = this.req.body;
    const where = jsonData.where;
    const conf = this.conf;
    const values = [];

    const validateInput = validateFields('Where', conf.deleteconf.where, Object.keys(where));
    log.debug('Search validation =' + validateInput + '\nwhere= ' + JSON.stringify(where));
    const DELETE = 'DELETE';
    const SELECT = 'SELECT' + SPACE + this.conf.key.toString();
    var deleteQuery = DELETE + SPACE + 'FROM' + SPACE + this.dbSchema + DOT + this.dbTable + SPACE + 'WHERE' + SPACE;
    const keys = Object.keys(where);
    deleteQuery = deleteQuery + keys.join(' = ? AND ') + ' = ? ' + SPACE;

    for (i = 0; i < keys.length; i++) {
        const k = keys[i];
        values.push(this.getEncryptedValue(conf, k.toString(), where[k], true));
    }

    const selectIds = deleteQuery.replace(DELETE, SELECT);
    return {
        "query": {
            sql: selectIds + SEMICOLON + deleteQuery,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": [values, values]
    };
};


/**
 * if present then update and create a new resource
 */
query.prototype.putifpresent = function () {
    const q = this.insertQuery();
    q.values.push(this.req.params.id);
    q.query = q.query + SPACE + 'ON DUPLICATE KEY UPDATE' + SPACE + this.conf.key + ' = ?';
    return {
        "query": {
            sql: q.query,
            nestTables: conf.query && conf.query.nesttables ? conf.query.nesttables : false,
            timeout: conf.query && conf.query.timeout ? conf.query.timeout : 60000
        },
        "values": q.values
    };
};

/**
 * Checks obj presence in array
 * @param blobArr array of objects {
      "col": "xml",
      "type": "string"
    }
 * @param col name
 * @returns {boolean}
 */
function containsBlob(blobArr, obj) {
    if (blobArr != undefined && blobArr != null && blobArr.length > 0) {
        for (i = 0; i < blobArr.length; i++) {
            if (blobArr[i].col == obj) {
                return blobArr[i];
            }
        }
    }
}

function isValidObject(obj) {
    return obj != null && obj != undefined && Object.keys(obj).length > 0;
}

/**
 * Checks obj presence in array
 * @param arr
 * @param obj
 * @returns {boolean}
 */
function contains(arr, obj) {
    return isLegalArray(arr) && arr.indexOf(obj) > -1;
}
function isLegalArray(subArray) {
    return subArray != null && subArray != undefined && subArray.length > 0;
}
/**
 * true if all the elements of subArray are in array
 * @param array
 * @param subArray
 */
function containsArray(array, subArray) {
    if (isLegalArray(array)
        && isLegalArray(subArray) && array.length >= subArray.length) {
        for (i = 0; i < subArray.length; i++) {
            if (!contains(array, subArray[i])) {
                return false;
            }
        }
        return true;
    }
}

function validateFields(clause, allowedFields, actualFields) {
    if (!containsArray(allowedFields, actualFields)) {
        throw new Error(isLegalArray(allowedFields) ? clause + ' only allowed on ' + JSON.stringify(allowedFields) : 'update not allowed');
    }
    return true;
}

/**
 * Building a map from object, key being toString of object key
 * @param obj
 * @returns {Map}
 */
function buildMap(obj) {
    const map = new Map();
    Object.keys(obj).forEach(function (key) {
        map.set(key.toString(), obj[key]);
    });
    return map;
}
module.exports = query;
