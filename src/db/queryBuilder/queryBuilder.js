const conf = require('./../../config/config');
const log = require('./../../log/logger');
const crypt = require('./../../common/encrypt');

const DOT = ".";
const SPACE = " ";

function query(req, resourceSchema, operationSchema) {
    this.req = req;
    this.body = req.body;
    this.dbTable = this.body.table;
    this.dbSchema = this.body.schema;
    this.cols = this.body.attr;
    this.resourceSchema = resourceSchema;
    this.schemaCols = this.resourceSchema.properties.attr.properties;
    this.conf = this.resourceSchema.properties.conf;
    this.operationSchema = operationSchema;
}

/**
 *  Encrypts value
 * @param conf SCHEMA_CONF
 * @param k CURRENT_KEY string value
 * @param rawValue RAW_VALUE non encrypted
 * @returns {*}
 */
function getValue(conf, k, rawValue) {
    if (contains(conf.hashobjs, k)) {
        return crypt.hashText(rawValue + "");
    } else if (contains(conf.encryptobjs, k)) {
        return crypt.encryptText(rawValue + "");
    } else if (!contains(conf.autoids, k) && !contains(conf.autodates, k)) {
        return (contains(conf.dates, k) ? new Date(rawValue) : rawValue);
    }
}

query.prototype.decryptValues = function (k, rawValue) {
    if (contains(this.conf.encryptobjs, k)) {
        return crypt.decryptText(rawValue + "");
    } else if (contains(this.conf.dates, k)) {
        return new Date(rawValue);
    } else {
        return rawValue;
    }
}

/**
 * Based on column mentioned in body and schema, method creates conditions and values array for help building query
 */
query.prototype.createConditionsAndValues = function () {
    const conditions = [];
    const values = [];
    const strSchemaKeyArray = [];
    const schemaCols = this.schemaCols;
    const conf = this.conf;
    const colMap = buildMap(this.cols);
    const schemaColMap = buildMap(schemaCols);

    Object.keys(schemaCols).forEach(function (k) {
        strSchemaKeyArray.push(k.toString());
    });

    log.debug('cols= ' + JSON.stringify(this.cols) + '\t\tconf.hashobjs =' + JSON.stringify(conf.hashobjs) + '\t\tconf.encryptobjs = ' + JSON.stringify(conf.encryptobjs) +
        '\t\tconf.autoids = ' + JSON.stringify(conf.autoids) + '\t\tstrSchemaKeyArray = ' + strSchemaKeyArray + '\t\tschemaCols = ' + JSON.stringify(schemaCols));


    strSchemaKeyArray.forEach(function (k) {
        //log.debug('k = ' + k + '\t\tcolMap.get(k) = ' + colMap.get(k) + '\t\t(schemaColMap.get(k).optional) = ' + (schemaColMap.get(k)).optional);
        const colValue = colMap.get(k) != null ? colMap.get(k) : (schemaColMap.get(k).optional != null ? schemaColMap.get(k).optional != null : null);
        if (colValue != null) {
            conditions.push(k);
            values.push(getValue(conf, k, colMap.get(k)));
        }
    });
    return {"conditions": conditions, "values": values};
}
/**
 * Creates insert query
 * @returns {{where: string, values: Array}}
 */
query.prototype.createInsertQuery = function () {
    var queryStr = 'INSERT INTO ' + this.dbSchema + DOT + this.dbTable + SPACE + '(';
    const q = this.createConditionsAndValues.call(this);
    log.debug('condition values from input ' + q);
    queryStr += q.conditions.join(',') + ')' + SPACE + 'values(';
    q.values.forEach(function (val) {
        queryStr += '?,';
    });
    queryStr = queryStr.substr(0, queryStr.length - 1) + ')';
    log.debug('query : ' + queryStr);
    return {"query": queryStr, "values": q.values};
}

/**
 * Creates insert query
 * @returns {{where: string, values: Array}}
 */
query.prototype.updateQuery = function () {
    const conf = this.conf;
    var queryStr = 'UPDATE ' + this.dbSchema + DOT + this.dbTable + SPACE + 'SET' + SPACE;
    const q = this.createConditionsAndValues.call(this);
    log.debug('condition values from input ' + q);
    queryStr += q.conditions.join('= ? , ');
    queryStr += SPACE + ' = ? WHERE' + SPACE + conf.pk + ' = ?';
    q.values.push(this.req.params.id);
    return {"query": queryStr, "values": q.values};
}

/**
 * Creates get query
 * @returns {{where: string, values: Array}}
 */
query.prototype.findByIDQuery = function () {
    const jsonData = this.req.body;
    const fields = jsonData.fields;
    const where = jsonData.where;
    const orderby = jsonData.orderby;
    const limit = jsonData.limit;
    const offset = jsonData.offset;
    const conf = this.conf;
    const schemaCols = this.schemaCols;
    const schemaColMap = buildMap(schemaCols);
    const values = [];

    log.debug('fields = ' + JSON.stringify(fields) + '\nwhere= ' + JSON.stringify(where) + '\norderby = '
        + JSON.stringify(orderby) + '\nlimit = ' + JSON.stringify(limit) + '\noffset = ' + offset);

    var queryStr = 'SELECT ' + SPACE + fields.join(',') + SPACE + 'FROM' + SPACE + this.dbSchema + DOT + this.dbTable + SPACE + 'WHERE' + SPACE;
    const keys = Object.keys(where);
    queryStr = queryStr + keys.join(' = ? AND ') + ' = ? ' + SPACE;
    keys.forEach(function (k) {
        values.push(getValue(conf, k.toString(), where[k]));
    });

    if (orderby) {
        queryStr = queryStr + SPACE + 'ORDER BY' + SPACE + orderby.order.join(',') + SPACE + (orderby.by != null && orderby.by != undefined ? orderby.by : 'ASC') + SPACE;
    }
    queryStr = queryStr + SPACE + 'LIMIT' + SPACE + (  limit ? limit : 10) + SPACE;
    if (offset) {
        queryStr = queryStr + SPACE + 'OFFSET' + SPACE + offset + SPACE;
    }

    return {"query": queryStr, "values": values};
}

/**
 * Checks obj presence in array
 * @param arr
 * @param obj
 * @returns {boolean}
 */
function contains(arr, obj) {
    return arr != null && arr.indexOf(obj) > -1;
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